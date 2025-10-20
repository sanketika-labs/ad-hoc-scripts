# NOTE: Run this script from the project root (migration-scripts) for all default paths to work.
import csv
import yaml
import logging
import os
import sys

import argparse
import requests
from datetime import datetime
from typing import List, Dict, Any, Tuple, Set
from logging.handlers import RotatingFileHandler

# Setup logging to file and console
log_file = os.path.join(os.path.dirname(__file__), 'course_batch_update.log')
log_formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=2)
file_handler.setFormatter(log_formatter)
console_handler = logging.StreamHandler()
console_handler.setFormatter(log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])

import time
import json

import platform

def update_cassandra_start_date(courseId, batchId, start_date, config, dry_run):
    """
    Update start_date in Cassandra for the given courseId and batchId.
    Uses config['cassandra'] for connection details.
    """
    cassandra_cfg = config.get('cassandra', {})
    keyspace = cassandra_cfg.get('keyspace', 'sunbird_courses')
    table = cassandra_cfg.get('course_batch_table', 'course_batch')
    cassandra_url = cassandra_cfg.get('connection_url', 'localhost')
    cassandra_port = cassandra_cfg.get('port', 9042)
    query = f"UPDATE {keyspace}.{table} SET start_date = '{start_date}' WHERE courseid='{courseId}' AND batchid='{batchId}';"
    if dry_run:
        logging.info(f"[DRY RUN] Would execute Cassandra query: {query}")
    else:
        try:
            from cassandra.cluster import Cluster
            import traceback
            logging.info(f"[CASSANDRA] About to execute: {query}")
            logging.info(f"[CASSANDRA] start_date type: {type(start_date)}, value: {start_date}")
            cluster = Cluster([cassandra_url], port=cassandra_port)
            session = cluster.connect(keyspace)
            session.execute(query)
            logging.info(f"[CASSANDRA] Executed: {query}")
            session.shutdown()
            cluster.shutdown()
        except Exception as e:
            logging.error(f"[CASSANDRA] Failed: {query} | Error: {repr(e)}\nTraceback: {traceback.format_exc()}")

# Removed: cassandra imports and logic

def load_config(path: str) -> dict:
    if not os.path.exists(path):
        print(f"\nERROR: Config file '{path}' not found.")
        print("Make sure you are running this command from the project root and using the correct --config path (e.g., 'config.yaml').\n")
        sys.exit(1)
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        handlers=[logging.StreamHandler(sys.stdout)]
    )

def parse_csv(input_path: str) -> List[Dict[str, Any]]:
    """
    Reads and cleans the input CSV, removing trailing spaces from all fields in all rows.
    Maps relevant columns to expected keys for processing. Adds robust validation and logs summary.
    """
    rows = []
    skipped = 0
    required_fields = ['Course ID', 'Batch ID', 'Start Date']
    seen = set()
    with open(input_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        count = 0
        for idx, row in enumerate(reader, 1):
            # Remove trailing spaces from all fields
            clean_row = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
            # Check required fields
            missing = [f for f in required_fields if not clean_row.get(f)]
            if missing:
                logging.warning(f"Row {idx} skipped: missing required fields: {missing} | {clean_row}")
                skipped += 1
                continue
            # Parse and validate date
            parsed_date = convert_date(clean_row['Start Date'])
            if not parsed_date:
                logging.warning(f"Row {idx} skipped: invalid Start Date '{clean_row['Start Date']}' | {clean_row}")
                skipped += 1
                continue
            # Check for duplicates (courseId, batchId)
            key = (clean_row['Course ID'], clean_row['Batch ID'])
            if key in seen:
                logging.warning(f"Row {idx} skipped: duplicate Course ID/Batch ID: {key}")
                skipped += 1
                continue
            seen.add(key)
            mapped_row = {
                'courseId': clean_row['Course ID'],
                'batchId': clean_row['Batch ID'],
                'start_date': parsed_date,
            }
            rows.append(mapped_row)
            count += 1
            if count % 100 == 0:
                logging.info(f"parse_csv: Processed {count} valid records so far...")
    logging.info(f"parse_csv: Total valid records processed: {count}")
    logging.info(f"parse_csv: Total rows skipped due to errors: {skipped}")
    return rows


# write_csv removed as per simplification request

def convert_date(date_str: str) -> str:
    """
    Robustly parse a date string in common user formats and return 'YYYY-MM-DD 00:00:00'.
    Accepts e.g. '1/3/2024', '01/03/2024', '2024-03-01', '2024/03/01', etc.
    Returns empty string if invalid.
    """
    if not date_str or not isinstance(date_str, str):
        return ''
    date_str = date_str.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d 00:00:00")
        except Exception:
            continue
    logging.warning(f"Could not parse date: '{date_str}'")
    return ''

def update_batches_via_api(rows: List[Dict[str, Any]], config: dict, dry_run: bool):
    """
    For each row, call the following APIs in order:
    1. Remove the old template
    2. Add the new template
    3. Update the start date
    """
    import ast
    import copy
    host = config['host']
    apikey = config['apikey']
    creator_access_token = config['creator_access_token']
    channel_id = config['channel_id']
    cert_templates = config['cert_templates']
    # Parse cert_templates from YAML string to dict if needed
    if isinstance(cert_templates, str):
        cert_templates = ast.literal_eval(cert_templates)
    # Use the only template in cert_templates
    template_id, template_obj = next(iter(cert_templates.items()))
    # Prepare template for add (deepcopy to avoid mutation)
    template_for_add = copy.deepcopy(template_obj)
    # Convert string fields to objects if needed
    if 'criteria' in template_for_add and isinstance(template_for_add['criteria'], str):
        template_for_add['criteria'] = json.loads(template_for_add['criteria'])
    if 'issuer' in template_for_add and isinstance(template_for_add['issuer'], str):
        template_for_add['issuer'] = json.loads(template_for_add['issuer'])
    if 'signatoryList' in template_for_add and isinstance(template_for_add['signatoryList'], str):
        template_for_add['signatoryList'] = json.loads(template_for_add['signatoryList'])
    remove_template_identifier = config['remove_template_identifier']
    for idx, row in enumerate(rows, 1):
        courseId = row['courseId']
        batchId = row['batchId']
        start_date = row['start_date']
        # --- Cassandra update step ---
        update_cassandra_start_date(courseId, batchId, start_date, config, dry_run)

        # --- 1. Remove old template ---
        remove_url = f"{host}/api/course/batch/cert/v1/template/remove"
        remove_headers = {
            'Authorization': f"Bearer {apikey}",
            'Content-Type': 'application/json',
            'x-authenticated-user-token': creator_access_token
        }
        remove_payload = {
            "request": {
                "batch": {
                    "courseId": courseId,
                    "batchId": batchId,
                    "template": {"identifier": remove_template_identifier}
                }
            }
        }
        # --- 2. Add new template ---
        add_url = f"{host}/api/course/batch/cert/v1/template/add"
        add_headers = remove_headers.copy()
        add_payload = {
            "request": {
                "batch": {
                    "courseId": courseId,
                    "batchId": batchId,
                    "template": template_for_add
                }
            }
        }
        # --- 3. Update start date ---
        update_url = f"{host}/api/course/v1/batch/update"
        update_headers = {
            'Authorization': f"Bearer {apikey}",
            'Content-Type': 'application/json',
            'x-authenticated-user-token': creator_access_token,
            'X-Channel-Id': channel_id
        }
        # Convert start_date to ISO format
        start_date = row['start_date']
        try:
            dt = datetime.strptime(start_date, "%Y-%m-%d 00:00:00")
            # Try multiple ISO 8601 formats for API
            iso_start_date = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            iso_start_date_alt = dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
        except Exception:
            iso_start_date = start_date  # fallback
            iso_start_date_alt = start_date
        # Try both formats in API call
        iso_start_dates = [iso_start_date, iso_start_date_alt]
        # --- Execute or print (dry_run) ---
        for step, url, headers, payload in [
            ("REMOVE_TEMPLATE", remove_url, remove_headers, remove_payload),
            ("ADD_TEMPLATE", add_url, add_headers, add_payload)
        ]:
            if dry_run:
                logging.info(f"[DRY RUN] {step} {url}\nPayload: {json.dumps(payload, ensure_ascii=False)}")
            else:
                try:
                    resp = requests.patch(url, headers=headers, json=payload, timeout=15)
                    if resp.ok:
                        logging.info(f"[SUCCESS] {step} for courseId={courseId}, batchId={batchId} | Status: {resp.status_code} | Input: {json.dumps(payload, ensure_ascii=False)}")
                    else:
                        logging.error(f"[FAILURE] {step} for courseId={courseId}, batchId={batchId} | Status: {resp.status_code} | Input: {json.dumps(payload, ensure_ascii=False)} | Response: {resp.text}")
                except Exception as e:
                    logging.error(f"[EXCEPTION] {step} for courseId={courseId}, batchId={batchId} | Input: {json.dumps(payload, ensure_ascii=False)} | Error: {e}")
        # --- Try both ISO formats for UPDATE_START_DATE ---
        for iso_date in iso_start_dates:
            update_payload = {
                "request": {
                    "enrollmentType": "open",
                    "startDate": iso_date,
                    "status": 1,
                    "courseId": courseId,
                    "id": batchId
                }
            }
            if dry_run:
                logging.info(f"[DRY RUN] UPDATE_START_DATE {update_url}\nPayload: {json.dumps(update_payload, ensure_ascii=False)}")
            else:
                try:
                    resp = requests.patch(update_url, headers=update_headers, json=update_payload, timeout=15)
                    if resp.ok:
                        logging.info(f"[SUCCESS] UPDATE_START_DATE for courseId={courseId}, batchId={batchId} | Status: {resp.status_code} | Input: {json.dumps(update_payload, ensure_ascii=False)}")
                        break  # Success, stop trying alternate formats
                    else:
                        logging.error(f"[FAILURE] UPDATE_START_DATE for courseId={courseId}, batchId={batchId} | Status: {resp.status_code} | Attempted startDate: {iso_date} | Input: {json.dumps(update_payload, ensure_ascii=False)} | Response: {resp.text}")
                except Exception as e:
                    logging.error(f"[EXCEPTION] UPDATE_START_DATE for courseId={courseId}, batchId={batchId} | Attempted startDate: {iso_date} | Input: {json.dumps(update_payload, ensure_ascii=False)} | Error: {e}")
        if idx % 100 == 0:
            logging.info(f"update_batches_via_api: Processed {idx} records so far...")
    logging.info(f"update_batches_via_api: Total records processed: {len(rows)}")

# --- Main CLI ---
def main():
    parser = argparse.ArgumentParser(description='Process course batches.')
    parser.add_argument('--input', default='course_batch_update/course_batch_input.csv', help='Input CSV path (default: course_batch_update/course_batch_input.csv)')
    parser.add_argument('--config', default='config.yaml', help='Config YAML path')
    parser.add_argument('--dry-run', default='true', choices=['true', 'false'], help='Dry run (true/false, default: true)')
    args = parser.parse_args()

    setup_logging()

    config = load_config(args.config)

    input_csv = args.input
    dry_run = args.dry_run.lower() == 'true'

    logging.info(f"Reading input from: {input_csv}")
    rows = parse_csv(input_csv)
    logging.info(f"Processing {len(rows)} records...")
    update_batches_via_api(rows, config, dry_run)
    logging.info("Processing complete.")

if __name__ == "__main__":
    main() 