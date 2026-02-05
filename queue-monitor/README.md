# Distributed Queue Performance Monitoring System

## Overview
This project provides a comprehensive performance monitoring solution for distributed queue management, featuring:
- Real-time metrics collection
- Configurable alerting mechanisms
- Multi-channel notifications (Email, Slack)
- Prometheus metrics exposure

## Features
- Monitor multiple Redis-based queues simultaneously
- Collect queue size, processing time, and error metrics
- Configurable alert thresholds
- Email and Slack notifications
- Prometheus metrics endpoint

## Prerequisites
- Python 3.8+
- Redis
- Prometheus (optional)

## Installation
1. Clone the repository
2. Create a virtual environment
```bash
python3 -m venv venv
source venv/bin/activate
```

3. Install dependencies
```bash
pip install -r requirements.txt
```

## Configuration
Edit `config/queue_config.yaml` to configure:
- Queue connection details
- Monitoring metrics
- Alert thresholds

Edit `src/notification_service.py` to configure:
- Email SMTP settings
- Slack webhook/token

## Running the Monitor
```bash
python src/queue_monitor.py
```

## Metrics Endpoints
- Prometheus metrics: `http://localhost:8000`

## Monitoring Strategy
1. Continuous queue size tracking
2. Processing time measurement
3. Error rate monitoring
4. Configurable alerting

## Alert Channels
- Email
- Slack

## Customization
- Modify `metrics_collector.py` to add custom metrics
- Update `notification_service.py` to add more notification channels

## Security Considerations
- Use environment variables for sensitive credentials
- Implement proper access controls
- Use app-specific passwords for email/Slack

## Troubleshooting
- Check `queue_monitor.log` for detailed logs
- Ensure Redis is running
- Verify notification service credentials

## License
MIT License