import csv
import yaml
import logging
import requests
import sys
import os
import uuid
from typing import Dict, List
from datetime import datetime
from kafka import KafkaProducer
import json
import copy
import argparse

def load_config(path: str) -> dict:
    if not os.path.exists(path):
        print(f"\nERROR: Config file '{path}' not found.")
        sys.exit(1)
    with open(path, 'r') as f:
        return yaml.safe_load(f)

# Setup logging to file and console
from logging.handlers import RotatingFileHandler
log_file = os.path.join(os.path.dirname(__file__), 'user_enrolments_post_update.log')
log_formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=2)
file_handler.setFormatter(log_formatter)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])

def setup_logging():
    # This function is now a no-op for backward compatibility with calls in main()
    pass

def delete_from_elasticsearch_for_csv(csv_path: str, es_host: str):
    count = 0
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            user_id = row.get('userId')
            batch_id = row.get('batchId')
            if not user_id or not batch_id:
                logging.warning(f"Skipping row with missing userId or batchId: {row}")
                continue
            delete_from_elasticsearch(es_host, user_id, batch_id)
            count += 1
            if count % 100 == 0:
                logging.info(f"delete_from_elasticsearch_for_csv: Processed {count} records so far...")
    logging.info(f"delete_from_elasticsearch_for_csv: Total records processed: {count}")

def delete_from_elasticsearch(es_host: str, user_id: str, batch_id: str):
    url = f"{es_host}/trainingcertificate/_delete_by_query"
    headers = {'Content-Type': 'application/json'}
    data = {
        "query": {
            "bool": {
                "must": [
                    {"match": {"recipient.id": user_id}},
                    {"match": {"training.batchId": batch_id}}
                ]
            }
        }
    }
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=30)
        if resp.status_code == 200:
            logging.info(f"Deleted from ES for userId={user_id}, batchId={batch_id}: {resp.json()}")
        else:
            logging.error(f"Failed to delete from ES for userId={user_id}, batchId={batch_id}: {resp.status_code} {resp.text}")
    except Exception as e:
        logging.error(f"Exception during ES delete for userId={user_id}, batchId={batch_id}: {e}")

def build_event(record: Dict, template: Dict) -> Dict:
    event = copy.deepcopy(template)
    batch_id = record['batchId']
    completed_on = record['completedOn'].split(' ')[0]  # 'YYYY-MM-DD'
    user_name = record['userName']
    user_id = record['userId']
    course_id = record['courseId']
    course_name = record['courseName']
    event['edata']['tag'] = batch_id
    event['edata']['issuedDate'] = completed_on
    event['edata']['data'][0]['recipientName'] = user_name
    event['edata']['data'][0]['recipientId'] = user_id
    event['edata']['related']['batchId'] = batch_id
    event['edata']['related']['courseId'] = course_id
    event['edata']['userId'] = user_id
    event['edata']['courseName'] = course_name
    event['object']['id'] = user_id
    event['mid'] = f"LMS.{str(uuid.uuid4())}"
    return event

def write_events_to_file(events: List[Dict], output_file: str):
    import os
    dir_name = os.path.dirname(output_file)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        for idx, event in enumerate(events, 1):
            event_json = json.dumps(event, ensure_ascii=False)
            print(event_json)  # Print each event to stdout
            f.write(event_json + '\n')
            if idx % 100 == 0:
                logging.info(f"write_events_to_file: Written {idx} events so far...")
    logging.info(f"write_events_to_file: Total events written: {len(events)}")

def push_events_to_kafka(events_file: str, kafka_host: str, kafka_topic: str, batch_size: int = 100):
    producer = KafkaProducer(
        bootstrap_servers=[kafka_host],
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode('utf-8')
    )
    batch = []
    total = 0
    with open(events_file, 'r', encoding='utf-8') as f:
        for line in f:
            event = json.loads(line)
            batch.append(event)
            total += 1
            if len(batch) >= batch_size:
                for e in batch:
                    producer.send(kafka_topic, value=e)
                logging.info(f"push_events_to_kafka: Pushed batch of {len(batch)} events to Kafka topic {kafka_topic}")
                batch = []
            if total % 100 == 0:
                logging.info(f"push_events_to_kafka: Processed {total} events so far...")
        if batch:
            for e in batch:
                producer.send(kafka_topic, value=e)
            logging.info(f"push_events_to_kafka: Pushed final batch of {len(batch)} events to Kafka topic {kafka_topic}")
    producer.flush()
    producer.close()
    logging.info(f"push_events_to_kafka: Total events processed: {total}")

def generate_events_from_csv(csv_path: str, event_template_path: str, output_file: str):
    with open(event_template_path, 'r', encoding='utf-8') as f:
        event_template = json.load(f)
    events = []
    count = 0
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            user_id = row.get('userId')
            batch_id = row.get('batchId')
            if not user_id or not batch_id:
                logging.warning(f"Skipping row with missing userId or batchId: {row}")
                continue
            event = build_event(row, event_template)
            events.append(event)
            count += 1
            if count % 100 == 0:
                logging.info(f"generate_events_from_csv: Processed {count} records so far...")
    write_events_to_file(events, output_file)
    logging.info(f"generate_events_from_csv: Total records processed: {count}")

def main():
    parser = argparse.ArgumentParser(description="Post Cassandra update operations: ES delete, event generation, Kafka push.")
    subparsers = parser.add_subparsers(dest='command', required=True)

    # ES delete
    parser_delete = subparsers.add_parser('delete-es', help='Delete records from Elasticsearch')
    parser_delete.add_argument('csv_path')
    parser_delete.add_argument('config_path')

    # Generate events
    parser_generate = subparsers.add_parser('generate-events', help='Generate events and write to file')
    parser_generate.add_argument('csv_path')
    parser_generate.add_argument('event_template_path')
    parser_generate.add_argument('events_output_file')

    # Push to Kafka
    parser_push = subparsers.add_parser('push-kafka', help='Push events to Kafka from file (batch size is set in config.yaml as kafka_batch_size)')
    parser_push.add_argument('events_file')
    parser_push.add_argument('config_path')

    # All steps
    parser_all = subparsers.add_parser('all', help='Run all steps: ES delete, generate events, push to Kafka (batch size is set in config.yaml as kafka_batch_size)')
    parser_all.add_argument('csv_path')
    parser_all.add_argument('config_path')
    parser_all.add_argument('event_template_path')
    parser_all.add_argument('events_output_file')

    args = parser.parse_args()
    setup_logging()

    if args.command == 'delete-es':
        config = load_config(args.config_path)
        es_host = config.get('es_host')
        if not es_host:
            logging.error("es_host not found in config file.")
            return
        delete_from_elasticsearch_for_csv(args.csv_path, es_host)

    elif args.command == 'generate-events':
        generate_events_from_csv(args.csv_path, args.event_template_path, args.events_output_file)

    elif args.command == 'push-kafka':
        config = load_config(args.config_path)
        kafka_host = config.get('kafka_host')
        kafka_topic = config.get('kafka_topic')
        kafka_batch_size = config.get('kafka_batch_size', 100)
        if not kafka_host or not kafka_topic:
            logging.error("kafka_host or kafka_topic not found in config file.")
            return
        push_events_to_kafka(args.events_file, kafka_host, kafka_topic, batch_size=kafka_batch_size)

    elif args.command == 'all':
        config = load_config(args.config_path)
        es_host = config.get('es_host')
        kafka_host = config.get('kafka_host')
        kafka_topic = config.get('kafka_topic')
        kafka_batch_size = config.get('kafka_batch_size', 100)
        if not es_host:
            logging.error("es_host not found in config file.")
            return
        if not kafka_host or not kafka_topic:
            logging.error("kafka_host or kafka_topic not found in config file.")
            return
        delete_from_elasticsearch_for_csv(args.csv_path, es_host)
        generate_events_from_csv(args.csv_path, args.event_template_path, args.events_output_file)
        push_events_to_kafka(args.events_output_file, kafka_host, kafka_topic, batch_size=kafka_batch_size)

if __name__ == "__main__":
    main() 