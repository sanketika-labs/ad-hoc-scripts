# Migration Scripts: User Enrolments & Course Batch Update

**IMPORTANT:** Run all commands from the project root (`migration-scripts`). All file paths in the examples below are relative to the project root.


This repository contains two migration utilities for updating user enrolments and course batch data in Cassandra. Both scripts share a common setup, configuration, and dependencies.

## Prerequisites
- Python 3.7+
- `requests`, `pyyaml`, and `cassandra-driver` libraries (install with `pip install -r requirements.txt`)
- Fill in your API and Cassandra details in the unified `config.yaml` at the project root

## Recommended: Use a Python Virtual Environment
Using a virtual environment keeps dependencies isolated and avoids conflicts with other projects.

1. **Navigate to your project directory:**
   ```bash
   cd /Users/admin/Documents/workspace/migration-scripts
   ```
2. **Create a virtual environment (named `venv`):**
   ```bash
   python3 -m venv venv
   ```
3. **Activate the virtual environment:**
   - On macOS/Linux:
     ```bash
     source venv/bin/activate
     ```
   - On Windows:
     ```bash
     venv\Scripts\activate
     ```
4. **Install the requirements:**
   ```bash
   pip install -r requirements.txt
   ```
5. **Run your scripts as usual.**
6. **When done, deactivate the environment:**
   ```bash
   deactivate
   ```
---

## 1. Course Batch Update

- **Script:** `course_batch_update/process_course_batches.py`
- **Config:** Uses the shared `config.yaml` (keys: `host`, `apikey`, `creator_access_token`, `channel_id`, `cert_templates`, `remove_template_identifier`)
- **Input CSV:** `course_batch_update/course_batch_input.csv`

### Usage

**Run the Course Batch Update Script:**
```bash
# Dry run (default)
python course_batch_update/process_course_batches.py --config config.yaml --input course_batch_update/course_batch_input.csv

# Real update (no dry run)
python course_batch_update/process_course_batches.py --config config.yaml --input course_batch_update/course_batch_input.csv --dry-run false
```
- By default, the script will run in dry-run mode (no real API calls, just logs the intended actions).
- To perform real updates, you must explicitly pass `--dry-run false`.
### How it works
- The script reads and cleans the input CSV (removes trailing spaces from all fields).
- For each row, it:
  - Removes the old certificate template for the given course and batch.
  - Adds the new certificate template.
  - Updates the batch start date.
- All API endpoints and credentials are loaded from your config file.

### CSV Format Example
```
Course Code,Course ID,Learning Profile,Batch Name,Batch ID,Start Date
FMPS_C001,do_214339477659320320184,FC2022,FMPS_C001_FC2022,0143457972090961921,2023/01/01
```
- Only `Course ID`, `Batch ID`, and `Start Date` are required for the batch update script.

### Troubleshooting
- Ensure your config file and CSV are in the correct paths and have the required fields.
- Check the logs for API errors or CSV formatting issues.

---

---

## 2. User Enrolments Update

- **Script:** `user_enrolments_update/process_csv.py`
- **Config:** Uses the shared `config.yaml` (must include `user_enrolments_table` in the `cassandra` section)
- **Input CSV:** `user_enrolments_update/user_enrolments_input.csv`
- **Output CSV:** `user_enrolments_update/user_enrolments_output.csv`

### Usage

> **All commands must be run from the project root (`migration-scripts`).**

#### 1. Generate the Output CSV
This step processes your input CSV and writes a cleaned, validated output CSV:
```bash
python user_enrolments_update/process_csv.py generate --config config.yaml --input user_enrolments_update/user_enrolments_input.csv --output user_enrolments_update/user_enrolments_output.csv
```

#### 2. Update Cassandra (Dry Run by Default)
This step applies the output CSV to Cassandra. By default, it runs in dry run mode (no real writes):
```bash
python user_enrolments_update/process_csv.py update --config config.yaml --output user_enrolments_update/user_enrolments_output.csv
```

#### 3. Force a Real Update (Disable Dry Run)
To actually write to Cassandra, add `--dry_run false`:
```bash
python user_enrolments_update/process_csv.py update --config config.yaml --output user_enrolments_update/user_enrolments_output.csv --dry_run false
```

---

#### 4. Post Cassandra Update Operations (Optional)
These steps are for deleting records from Elasticsearch and generating/pushing Kafka events.

**a. Delete records from Elasticsearch**
```bash
python user_enrolments_update/post_update_ops.py delete-es user_enrolments_update/user_enrolments_output.csv config.yaml
```

**b. Generate Kafka events**
```bash
python user_enrolments_update/post_update_ops.py generate-events user_enrolments_update/user_enrolments_output.csv user_enrolments_update/event_template.json events_to_push.jsonl
```

**c. Push events to Kafka**
```bash
python user_enrolments_update/post_update_ops.py push-kafka events_to_push.jsonl config.yaml
```

---

**Config Best Practice:**
- Set your Cassandra host as `connection_url: "cassandra.sunbird.svc.cluster.local"` and port as `port: 9042` in your config. Both `host:port` and separate fields are supported, but separating is recommended.
- Ensure all paths are relative to the project root.
- The pipeline is robust to missing/invalid data and will log warnings for skipped records.

## 3. Post Cassandra Update Operations

**Script:** `user_enrolments_update/post_update_ops.py`

### Steps to Run

1. Ensure your `config.yaml` contains the following keys:
   - `es_host`
   - `kafka_host`
   - `kafka_topic`
2. Prepare your event template file (e.g., `event_template.json`).

### Step-by-Step Usage

#### 1. Delete records from Elasticsearch
Removes certificate records for each user enrolment in the output CSV.
```bash
python user_enrolments_update/post_update_ops.py delete-es user_enrolments_update/user_enrolments_output.csv config.yaml
```

#### 2. Generate Kafka events
Creates a JSONL file with one event per record, using your event template.
```bash
python user_enrolments_update/post_update_ops.py generate-events user_enrolments_update/user_enrolments_output.csv user_enrolments_update/event_template.json events_to_push.jsonl
```

#### 3. Push events to Kafka
Reads the generated events file and pushes events to the configured Kafka topic in batches.
```bash
python user_enrolments_update/post_update_ops.py push-kafka events_to_push.jsonl config.yaml
```

#### (Optional) Run all steps in sequence
Performs ES delete, event generation, and Kafka push in one command.
```bash
python user_enrolments_update/post_update_ops.py all user_enrolments_update/user_enrolments_output.csv config.yaml user_enrolments_update/event_template.json events_to_push.jsonl
```

---

## 4. Running with Docker

### Build the Docker image
```bash
docker build -t migration-scripts:latest .
```

### Run the container and mount your workspace (so changes are reflected)
```bash
docker run -it --rm -v $(pwd):/app migration-scripts:latest
```

You will be dropped into a bash shell inside the container. You can then run any of the scripts as usual, e.g.:
```bash
python user_enrolments_update/process_csv.py ...
```

---

## Helm Chart Deployment (Kubernetes)

The Helm chart is now located in the `helmchart/` folder.

### Basic Usage

- **Render the manifests (dry run):**
  ```sh
  helm template migration-scripts ./helmchart
  ```
- **Install the chart:**
  ```sh
  helm install migration-scripts ./helmchart
  ```
- **Upgrade the chart:**
  ```sh
  helm upgrade migration-scripts ./helmchart
  ```

Edit `helmchart/values.yaml` to enable/disable jobs or change arguments as needed.

---

## Running Migration Jobs in Kubernetes

You can run each migration pipeline step as a Kubernetes Job using the YAMLs in `helmchart/templates/`. Run each job one at a time, in the correct order for your pipeline.

### User Enrolments Update Pipeline

1. **Generate Output CSV**
   ```bash
   kubectl apply -f helmchart/templates/job-user-enrolments-update-generate.yaml
   # Wait for the job to complete (kubectl get jobs, kubectl logs ...)
   ```
2. **Update Cassandra**
   ```bash
   kubectl apply -f helmchart/templates/job-user-enrolments-update-update.yaml
   # Wait for completion
   ```
3. **Delete records from Elasticsearch**
   ```bash
   kubectl apply -f helmchart/templates/job-user-enrolments-update-delete-es.yaml
   # Wait for completion
   ```
4. **Generate Kafka events**
   ```bash
   kubectl apply -f helmchart/templates/job-user-enrolments-update-generate-events.yaml
   # Wait for completion
   ```
5. **Push events to Kafka**
   ```bash
   kubectl apply -f helmchart/templates/job-user-enrolments-update-push-kafka.yaml
   # Wait for completion
   ```

### Course Batch Update Pipeline

1. **Dry Run**
   ```bash
   kubectl apply -f helmchart/templates/job-course-batch-update-dry-run.yaml
   # Review logs and results before proceeding to real update
   ```
2. **Real Update**
   ```bash
   kubectl apply -f helmchart/templates/job-course-batch-update.yaml
   # Wait for completion
   ```

**Notes:**
- Wait for each job to complete before running the next step.
- All jobs use the same volumes and mounts as the deployment, so data and config are shared.
- You can monitor job status with `kubectl get jobs` and view logs with `kubectl logs job/<job-name> -c <container-name>`.

## Notes
- You can specify custom paths for config, input, and output files using the `--config`, `--input`, and `--output` options.
- You can override the `dry_run` value from the command line using `--dry_run true` or `--dry_run false`.
- Make sure your `config.yaml` is up to date with the correct API, Cassandra, and cert_templates details.
- Review the logs for any missing data or errors. 