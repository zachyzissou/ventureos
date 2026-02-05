import os
import time
import yaml
import logging
from metrics_collector import QueueMetricsCollector, AlertManager
from notification_service import NotificationService, NOTIFICATION_CONFIG

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('queue_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DistributedQueueMonitor:
    def __init__(self, config_path):
        """
        Initialize queue monitoring system
        
        :param config_path: Path to queue configuration YAML
        """
        # Load configuration
        with open(config_path, 'r') as config_file:
            self.config = yaml.safe_load(config_file)
        
        # Initialize metrics collector
        self.metrics_collector = QueueMetricsCollector()
        
        # Prepare queue names for monitoring
        self.monitored_queues = [
            queue['name'] for queue in self.config['queues'] 
            if queue.get('monitoring', {}).get('enabled', False)
        ]
        
        # Prepare alert thresholds
        self.alert_config = {
            queue['name']: {
                k: v for k, v in queue.get('alerts', {}).items()
                if k.endswith('_threshold')
            }
            for queue in self.config['queues']
        }
        
        # Initialize alert manager
        self.alert_manager = AlertManager(self.alert_config)
        
        # Initialize notification service
        self.notification_service = NotificationService(NOTIFICATION_CONFIG)
    
    def run(self, interval=30):
        """
        Run continuous queue monitoring
        
        :param interval: Monitoring interval in seconds
        """
        # Start collecting metrics
        self.metrics_collector.collect_queue_metrics(self.monitored_queues)
        
        logger.info(f"Starting queue monitoring for: {self.monitored_queues}")
        
        try:
            while True:
                # Collect current queue metrics (this would be more sophisticated in a real system)
                current_metrics = {}
                for queue_name in self.monitored_queues:
                    current_metrics[queue_name] = {
                        'size': self.metrics_collector.redis_client.llen(queue_name),
                        # In a real system, you'd collect more detailed metrics
                        'avg_processing_time': 10  # Placeholder
                    }
                
                # Check for alerts
                alerts = self.alert_manager.check_queue_alerts(current_metrics)
                
                # Send notifications if there are alerts
                if alerts:
                    logger.warning(f"Alerts detected: {alerts}")
                    self.notification_service.send_alert(alerts)
                
                # Wait before next monitoring cycle
                time.sleep(interval)
        
        except KeyboardInterrupt:
            logger.info("Queue monitoring stopped.")
        except Exception as e:
            logger.error(f"Monitoring error: {e}")
            # Send critical error notification
            self.notification_service.send_alert([f"CRITICAL: Monitoring system failure - {e}"])

def main():
    # Determine config path (use environment variable or default)
    config_path = os.environ.get(
        'QUEUE_MONITOR_CONFIG', 
        os.path.join(os.path.dirname(__file__), '..', 'config', 'queue_config.yaml')
    )
    
    # Initialize and run monitor
    monitor = DistributedQueueMonitor(config_path)
    monitor.run()

if __name__ == '__main__':
    main()