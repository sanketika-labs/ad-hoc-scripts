# Use official Python image
FROM --platform=linux/amd64 python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (if needed)
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the necessary code and config
COPY user_enrolments_update/ user_enrolments_update/
COPY user_enrolments_update/event_template.json user_enrolments_update/event_template.json
COPY course_batch_update/ course_batch_update/
COPY config.yaml ./

# Set environment variables (optional)
ENV PYTHONUNBUFFERED=1

# Default entrypoint: open bash so user can run any script
ENTRYPOINT ["/bin/bash"] 