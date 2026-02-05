import time
import threading
import queue
import psutil
import redis
import prometheus_client
from typing import Dict, Any, List

class QueueMetricsCollector:
    def __init__(self, redis_host='localhost', redis_port=6379, prometheus_port=8000):
        # Redis connection for distributed queue monitoring
        self.redis_client = redis.Redis(host=redis_host, port=redis_port)
        
        # Prometheus metrics
        prometheus_client.start_http_server(prometheus_port)
        
        # Define Prometheus metrics
        self.queue_size = prometheus_client.Gauge(
            'queue_current_size', 
            'Current size of the distributed queue',
            ['queue_name']
        )
        self.queue_processing_time = prometheus_client.Histogram(
            'queue_processing_time_seconds',
            'Time taken to process queue items',
            ['queue_name']
        )
        self.queue_error_count = prometheus_client.Counter(
            'queue_error_total',
            'Total number of queue processing errors',
            ['queue_name']
        )
    
    def collect_queue_metrics(self, queue_names: List[str], interval: int = 30):
        """
        Continuously collect metrics for specified queues
        
        :param queue_names: List of queue names to monitor
        :param interval: Collection interval in seconds
        """
        def metric_collection_thread():
            while True:
                for queue_name in queue_names:
                    try:
                        # Get queue size from Redis
                        queue_size = self.redis_client.llen(queue_name)
                        self.queue_size.labels(queue_name=queue_name).set(queue_size)
                        
                        # Additional metrics can be collected here
                    except Exception as e:
                        self.queue_error_count.labels(queue_name=queue_name).inc()
                        print(f"Error collecting metrics for {queue_name}: {e}")
                
                time.sleep(interval)
        
        # Start metrics collection in a background thread
        thread = threading.Thread(target=metric_collection_thread, daemon=True)
        thread.start()

class AlertManager:
    def __init__(self, threshold_config: Dict[str, Dict[str, Any]]):
        """
        Initialize alert manager with threshold configurations
        
        :param threshold_config: Dictionary of alert thresholds per queue
        Example: {
            'order_queue': {
                'size_threshold': 1000,
                'processing_time_threshold': 60
            }
        }
        """
        self.threshold_config = threshold_config
        self.alerts = []
    
    def check_queue_alerts(self, queue_metrics: Dict[str, Dict[str, Any]]) -> List[str]:
        """
        Check queue metrics against configured thresholds
        
        :param queue_metrics: Current queue metrics
        :return: List of alert messages
        """
        current_alerts = []
        
        for queue_name, metrics in queue_metrics.items():
            queue_config = self.threshold_config.get(queue_name, {})
            
            # Size threshold alert
            if (size_threshold := queue_config.get('size_threshold')) is not None:
                if metrics['size'] > size_threshold:
                    current_alerts.append(
                        f"ALERT: Queue {queue_name} size ({metrics['size']}) "
                        f"exceeds threshold {size_threshold}"
                    )
            
            # Processing time threshold alert
            if (time_threshold := queue_config.get('processing_time_threshold')) is not None:
                if metrics.get('avg_processing_time', 0) > time_threshold:
                    current_alerts.append(
                        f"ALERT: Queue {queue_name} processing time "
                        f"({metrics.get('avg_processing_time', 0)}s) exceeds threshold {time_threshold}s"
                    )
        
        return current_alerts

# Example usage
if __name__ == '__main__':
    # Initialize metrics collector
    metrics_collector = QueueMetricsCollector()
    
    # Define queues to monitor
    monitored_queues = ['order_queue', 'payment_queue', 'shipping_queue']
    
    # Start collecting metrics
    metrics_collector.collect_queue_metrics(monitored_queues)
    
    # Alert configuration
    alert_config = {
        'order_queue': {
            'size_threshold': 500,
            'processing_time_threshold': 30
        },
        'payment_queue': {
            'size_threshold': 200,
            'processing_time_threshold': 15
        }
    }
    
    # Initialize alert manager
    alert_manager = AlertManager(alert_config)
    
    # Keep the script running
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("Monitoring stopped.")