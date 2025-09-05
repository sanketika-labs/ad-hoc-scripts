# NOTE: Run this script from the project root (migration-scripts) for all default paths to work.
import csv
import yaml
import logging
import requests
import sys
import os
import argparse
from typing import List, Dict, Any
from time import sleep

import platform
from datetime import datetime
import logging
from logging.handlers import RotatingFileHandler

# Setup logging to file and console
log_file = os.path.join(os.path.dirname(__file__), 'user_enrolments_update.log')
log_formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=2)
file_handler.setFormatter(log_formatter)
console_handler = logging.StreamHandler()
console_handler.setFormatter(log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])


def convert_date(date_str: str, try_mmddyyyy: bool = False) -> str:
    """
    Robustly parse a date string in common user formats and return 'YYYY-MM-DD 00:00:00'.
    Accepts e.g. '1/3/2024', '01/03/2024', '2024-03-01', '2024/03/01', etc.
    Optionally tries MM/DD/YYYY if try_mmddyyyy is True (for single code/date case).
    Returns empty string if invalid.
    """
    if not date_str or not isinstance(date_str, str):
        return ''
    date_str = date_str.strip()
    # Try D/M/Y and Y-M-D formats first
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d 00:00:00")
        except Exception:
            continue
    # If flagged, try MM/DD/YYYY (US format)
    if try_mmddyyyy:
        for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"):
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime("%Y-%m-%d 00:00:00")
            except Exception:
                continue
    logging.warning(f"Could not parse date: '{date_str}' (tried multiple formats, MM/DD/YYYY allowed={try_mmddyyyy})")
    return ''

try:
    from cassandra.cluster import Cluster
except ImportError:
    Cluster = None
    # Will raise error if actual update is attempted without cassandra-driver

# Load config
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

def null_string_check(s):
    return s if s is not None else ''

def fetch_user_id_and_name(email: str, config: dict):
    url = f"{config['host']}/api/user/v1/search"
    headers = {
        'Authorization': f"Bearer {config['apikey']}",
        'x-authenticated-user-token': config['access_token'],
        'Content-Type': 'application/json',
    }
    data = {
        "request": {
            "filters": {"email": email},
            "fields": ["userId", "firstName", "lastName"]
        }
    }
    logging.info(f"Fetching userId and userName for email: {email}")
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=10)
        if resp.status_code != 200:
            logging.error(f"API call to {url} for email {email} returned status code {resp.status_code}: {resp.text}")
        resp.raise_for_status()
        res = resp.json()
        content = res.get('result', {}).get('response', {}).get('content', [])
        if content:
            user_id = content[0].get('userId', '')
            first_name = content[0].get('firstName', '')
            last_name = content[0].get('lastName', '')
            user_name = f"{null_string_check(first_name)} {null_string_check(last_name)}".strip()
            logging.info(f"Success: userId for {email} is {user_id}, userName is {user_name}")
            return user_id, user_name
        else:
            logging.warning(f"No userId or userName found for {email}")
    except Exception as e:
        logging.error(f"UserId fetch failed for {email}: {e}")
    return None, None

def fetch_course_id_and_name(course_code: str, config: dict):
    url = f"{config['host']}/api/composite/v1/search"
    headers = {
        'Content-Type': 'application/json',
        'X-Channel-Id': config['channel_id'],
        'Authorization': f"Bearer {config['apikey']}",
        'x-authenticated-user-token': config['access_token'],
    }
    data = {
        "request": {
            "filters": {"code": course_code, "status": ["Live"]},
            "fields": ["identifier", "name"],
            "limit": 1
        }
    }
    logging.info(f"Fetching courseId and courseName for courseCode: {course_code}")
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=10)
        if resp.status_code != 200:
            logging.error(f"API call to {url} for course_code {course_code} returned status code {resp.status_code}: {resp.text}")
        resp.raise_for_status()
        res = resp.json()
        content = res.get('result', {}).get('content', [])
        if content:
            course_id = content[0].get('identifier', '')
            course_name = content[0].get('name', '')
            logging.info(f"Success: courseId for {course_code} is {course_id}, courseName is {course_name}")
            return course_id, course_name
        else:
            logging.warning(f"No courseId or courseName found for {course_code}")
    except Exception as e:
        logging.error(f"CourseId fetch failed for {course_code}: {e}")
    return None, None

def fetch_batch_id(batch_code: str, config: dict) -> str:
    url = f"{config['host']}/api/course/v1/batch/list"
    headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-channel-id': config['channel_id'],
        'Authorization': f"Bearer {config['apikey']}",
        'x-authenticated-user-token': config['access_token'],
    }
    data = {
        "request": {
            "filters": {"name": batch_code, "status": [0, 1]},
            "fields": ["identifier"]
        }
    }
    logging.info(f"Fetching batchId for batchName: {batch_code}")
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=10)
        if resp.status_code != 200:
            logging.error(f"API call to {url} for batch_code {batch_code} returned status code {resp.status_code}: {resp.text}")
        resp.raise_for_status()
        res = resp.json()
        content = res.get('result', {}).get('response', {}).get('content', [])
        if content and 'identifier' in content[0]:
            batch_id = content[0]['identifier']
            logging.info(f"Success: batchId for {batch_code} is {batch_id}")
            return batch_id
        else:
            logging.warning(f"No batchId found for {batch_code}")
    except Exception as e:
        logging.error(f"BatchId fetch failed for {batch_code}: {e}")
    return None

def parse_csv(input_path: str) -> List[Dict[str, Any]]:
    rows = []
    with open(input_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        count = 0
        for row in reader:
            # Trim spaces from all field values
            clean_row = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
            rows.append(clean_row)
            count += 1
            if count % 100 == 0:
                logging.info(f"parse_csv: Processed {count} records so far...")
    logging.info(f"parse_csv: Total records processed: {count}")
    return rows

def write_csv(output_path: str, rows: List[Dict[str, Any]]):
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fieldnames = ["email", "userId", "userName", "learnerProfileCode", "courseCode", "courseId", "courseName", "batchName", "batchId", "completedOn"]
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        count = 0
        for row in rows:
            writer.writerow(row)
            count += 1
            if count % 100 == 0:
                logging.info(f"write_csv: Written {count} records so far...")
    logging.info(f"write_csv: Total records written: {count}")

def process(input_csv: str, output_csv: str, config: dict):
    logging.info(f"Starting process: Reading input CSV {input_csv}")
    input_rows = parse_csv(input_csv)
    output_rows = []
    missing_users, missing_courses, missing_batches = set(), set(), set()
    total, success = 0, 0
    for row in input_rows:
        email = row['email']
        learnerProfileCode = row['Groupe']
        codes = [c.strip() for c in row['Codes'].split(',')]
        dates = [d.strip() for d in row['cours complétés le'].split(',')]
        if len(codes) != len(dates):
            logging.warning(f"Codes and dates count mismatch for {email}")
            continue
        userId, userName = fetch_user_id_and_name(email, config)
        if not userId:
            missing_users.add(email)
        valid = True
        parsed_dates = []
        # If only one code/date, allow MM/DD/YYYY parsing
        if len(codes) == 1 and len(dates) == 1:
            parsed = convert_date(dates[0], try_mmddyyyy=True)
            if not parsed:
                logging.warning(f"Skipping row for {email}: invalid completion date '{dates[0]}' in '{row['cours complétés le']}' (single entry, tried MM/DD/YYYY)")
                continue
            parsed_dates.append(parsed)
        else:
            for d in dates:
                parsed = convert_date(d)
                if not parsed:
                    logging.warning(f"Skipping row for {email}: invalid completion date '{d}' in '{row['cours complétés le']}'")
                    valid = False
                    break
                parsed_dates.append(parsed)
            if not valid:
                continue
        if not valid:
            continue
        userId, userName = fetch_user_id_and_name(email, config)
        if not userId:
            missing_users.add(email)
        for code, completedOn_fmt in zip(codes, parsed_dates):
            courseId, courseName = fetch_course_id_and_name(code, config)
            if not courseId:
                missing_courses.add(code)
            batchName = f"{code}_{learnerProfileCode}"
            batchId = fetch_batch_id(batchName, config) or ''
            if not batchId:
                missing_batches.add(batchName)
            # Skip record if any of userId, courseId, or batchId is empty
            if not userId or not courseId or not batchId:
                logging.warning(f"Skipping record for email={email}, code={code}, batchName={batchName} due to missing fields: userId={userId}, courseId={courseId}, batchId={batchId}")
                if not userId:
                    missing_users.add(email)
                if not courseId:
                    missing_courses.add(code)
                if not batchId:
                    missing_batches.add(batchName)
                continue
            output_rows.append({
                "email": email,
                "userId": userId,
                "userName": userName or '',
                "learnerProfileCode": learnerProfileCode,
                "courseCode": code,
                "courseId": courseId,
                "courseName": courseName or '',
                "batchName": batchName,
                "batchId": batchId,
                "completedOn": completedOn_fmt
            })
            total += 1
            if total % 100 == 0:
                logging.info(f"process: Processed {total} output records so far...")
            success += 1
    logging.info(f"process: Total output records processed: {total}")
    logging.info(f"process: Total processed: {total}, Success: {success}")
    if missing_users:
        logging.warning(f"Missing userIds for: {sorted(missing_users)}")
    if missing_courses:
        logging.warning(f"Missing courseIds for: {sorted(missing_courses)}")
    if missing_batches:
        logging.warning(f"Missing batchIds for: {sorted(missing_batches)}")
    # Only valid and complete records are written to output_rows and the CSV.
    # No missing users/courses/batches are added to the CSV.
    write_csv(output_csv, output_rows)
    return output_rows

def generate_cassandra_queries(rows: List[Dict[str, Any]], config: dict):
    queries = []
    keyspace = config.get('cassandra', {}).get('keyspace', 'your_keyspace')
    table = config.get('cassandra', {}).get('user_enrolments_table', 'user_enrolments')
    count = 0
    for row in rows:
        if row['userId'] and row['courseId'] and row['batchId']:
            q = (
                f"UPDATE {keyspace}.{table} "
                f"SET issued_certificates = null, completedon = '{row['completedOn']}' "
                f"WHERE userid = '{row['userId']}' AND courseid = '{row['courseId']}' AND batchid = '{row['batchId']}' IF EXISTS;"
            )
            queries.append(q)
            count += 1
            if count % 100 == 0:
                logging.info(f"generate_cassandra_queries: Generated {count} queries so far...")
    logging.info(f"generate_cassandra_queries: Total queries generated: {count}")
    return queries

def execute_cassandra_queries(queries, cassandra_config):
    import sys
    # Check Python version
    major, minor = sys.version_info[:2]
    if major == 3 and minor >= 12:
        logging.error("Python 3.12+ is not supported by cassandra-driver. Please use Python 3.11 or lower for actual Cassandra updates.")
        sys.exit(1)
    try:
        from cassandra.cluster import Cluster
    except ImportError:
        logging.error("cassandra-driver is not installed. Run 'pip install cassandra-driver' to enable actual updates.")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Failed to import cassandra-driver: {e}")
        sys.exit(1)
    url = cassandra_config['connection_url'].replace('cassandra://', '')
    if ':' in url:
        host, port = url.split(':')
        port = int(port)
    else:
        host = url
        port = 9042
    processed = 0
    try:
        cluster = Cluster([host], port=port)
        session = cluster.connect(cassandra_config['keyspace'])
        for query in queries:
            try:
                session.execute(query)
                processed += 1
                if processed % 100 == 0:
                    logging.info(f"execute_cassandra_queries: Executed {processed} queries so far...")
                logging.info(f"[CASSANDRA] Executed: {query}")
            except Exception as e:
                logging.error(f"[CASSANDRA] Failed: {query}\nError: {e}")
        session.shutdown()
        cluster.shutdown()
    except Exception as e:
        logging.error(f"[CASSANDRA] Connection failed: {e}")
        sys.exit(1)
    logging.info(f"execute_cassandra_queries: Total queries executed: {processed}")

def update_cassandra(rows: List[Dict[str, Any]], config: dict, dry_run: bool):
    logging.info(f"update_cassandra called. Rows to process: {len(rows)}")
    queries = generate_cassandra_queries(rows, config)
    batch_size = config.get('batch_size', 50)
    cassandra_url = config.get('cassandra', {}).get('connection_url', 'cassandra://localhost:9042')
    sleep_time = config.get('cassandra_batch_sleep', 0.1)
    processed = 0
    for i in range(0, len(queries), batch_size):
        batch = queries[i:i+batch_size]
        if dry_run:
            logging.info(f"[DRY RUN] Would execute batch on {cassandra_url}:")
            for q in batch:
                logging.info(q)
        else:
            execute_cassandra_queries(batch, config['cassandra'])
        processed += len(batch)
        logging.info(f"update_cassandra: Processed {processed} queries so far...")
        sleep(sleep_time)
    logging.info(f"update_cassandra: Total queries processed: {processed}")

def main():
    setup_logging()
    parser = argparse.ArgumentParser(description="CSV to Cassandra migration utility. Two steps: generate (CSV), update (Cassandra). Run from the project root.")
    parser.add_argument('command', choices=['generate', 'update'], help="Step to run: 'generate' to create user_enrolments_output.csv, 'update' to update Cassandra from user_enrolments_output.csv")
    parser.add_argument('--config', default='config.yaml', help='Path to config.yaml (relative to project root)')
    parser.add_argument('--input', default='user_enrolments_update/user_enrolments_input.csv', help='Input CSV (relative to project root, for generate)')
    parser.add_argument('--output', default='user_enrolments_update/user_enrolments_output.csv', help='Output CSV (relative to project root, for generate and update)')
    parser.add_argument('--dry_run', type=str, choices=['true', 'false'], help='Override dry_run from config (true/false)')
    args = parser.parse_args()
    config = load_config(args.config)
    dry_run = config.get('dry_run', True)
    if args.dry_run is not None:
        dry_run = args.dry_run.lower() == 'true'

    if args.command == 'generate':
        process(args.input, args.output, config)
    elif args.command == 'update':
        if not os.path.exists(args.output):
            logging.error(f"Output CSV '{args.output}' not found. Please run the 'generate' step first to create it.")
            sys.exit(1)
        rows = parse_csv(args.output)
        update_cassandra(rows, config, dry_run)
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 