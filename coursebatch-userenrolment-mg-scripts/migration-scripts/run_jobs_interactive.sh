#!/bin/bash

set -e

NAMESPACE="sunbird"  # Change if needed
RELEASE="migration-scripts"
CHART_PATH="./helmchart"

# List of jobs in order
JOBS=(
  courseBatchGenerate
  courseBatchDryRun
  courseBatchUpdate
  userEnrolmentsGenerate
  userEnrolmentsDryRun
  userEnrolmentsUpdate
  postUpdateDeleteEs
  postUpdateGenerateEvents
  postUpdatePushKafka
)

function wait_for_job() {
  JOB_KEY="$1"
  # Map JOB_KEY to actual job name in YAML
  case "$JOB_KEY" in
    courseBatchGenerate)
      JOB_NAME="course-batch-generate" ;;
    courseBatchDryRun)
      JOB_NAME="course-batch-dryrun" ;;
    courseBatchUpdate)
      JOB_NAME="course-batch-update" ;;
    userEnrolmentsGenerate)
      JOB_NAME="user-enrolments-generate" ;;
    userEnrolmentsDryRun)
      JOB_NAME="user-enrolments-dryrun" ;;
    userEnrolmentsUpdate)
      JOB_NAME="user-enrolments-update" ;;
    postUpdateDeleteEs)
      JOB_NAME="postupdate-delete-es" ;;
    postUpdateGenerateEvents)
      JOB_NAME="postupdate-generate-events" ;;
    postUpdatePushKafka)
      JOB_NAME="postupdate-push-kafka" ;;
    *)
      JOB_NAME="$JOB_KEY" ;;
  esac
  echo "Waiting for job $JOB_NAME to complete..."
  kubectl -n "$NAMESPACE" wait --for=condition=complete --timeout=600s job/$JOB_NAME || {
    echo "Job $JOB_NAME did not complete successfully.";
    exit 1;
  }
}

function confirm() {
  read -p "Proceed to the next job? (y/n): " yn
  case $yn in
      [Yy]* ) ;;
      * ) echo "Aborting."; exit 1;;
  esac
}

echo "Starting interactive job runner for migration-scripts Helm chart."

for JOB in "${JOBS[@]}"; do
  printf "\n---\n"
  echo "Deploying job: $JOB"
  # Build --set string to enable only this job
  SET_ARGS=""
  for J in "${JOBS[@]}"; do
    if [ "$J" == "$JOB" ]; then
      SET_ARGS+="--set jobs.$J.enabled=true "
    else
      SET_ARGS+="--set jobs.$J.enabled=false "
    fi
  done
  # Deploy with only this job enabled
  helm upgrade --install "$RELEASE" "$CHART_PATH" $SET_ARGS --namespace "$NAMESPACE"
  wait_for_job "$JOB"
  confirm
  echo "Job $JOB completed."
done

echo "All jobs completed successfully." 