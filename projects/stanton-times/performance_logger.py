import logging
import json
from datetime import datetime, timedelta

from src.config import get_log_path, get_metrics_path

class PerformanceLogger:
    def __init__(self, log_file_path=None, metrics_file_path=None):
        self.log_file_path = log_file_path or get_log_path('performance.log')
        self.metrics_file_path = metrics_file_path or get_metrics_path('tweet_metrics.json')
        # Configure logging
        logging.basicConfig(
            filename=self.log_file_path, 
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger('StantonTimesPerformance')

    def log_tweet_performance(self, tweet_data):
        """
        Log performance metrics for a published tweet
        """
        try:
            metrics = {
                'timestamp': datetime.utcnow().isoformat(),
                'tweet_id': tweet_data.get('id'),
                'source': tweet_data.get('source'),
                'engagement': {
                    'likes': tweet_data.get('likes', 0),
                    'retweets': tweet_data.get('retweets', 0),
                    'replies': tweet_data.get('replies', 0)
                }
            }
            
            # Load existing metrics
            try:
                with open(self.metrics_file_path, 'r') as f:
                    existing_metrics = json.load(f)
            except FileNotFoundError:
                existing_metrics = []
            
            # Append new metrics
            existing_metrics.append(metrics)
            
            # Limit to last 1000 entries
            existing_metrics = existing_metrics[-1000:]
            
            # Save updated metrics
            with open(self.metrics_file_path, 'w') as f:
                json.dump(existing_metrics, f, indent=2)
            
            self.logger.info(f"Logged performance for tweet {tweet_data.get('id')}")
        
        except Exception as e:
            self.logger.error(f"Failed to log tweet performance: {e}")

    def log_error(self, component, error_message):
        """
        Log errors from different components
        """
        self.logger.error(f"[{component}] {error_message}")

    def generate_performance_report(self, days=30):
        """
        Generate a performance report for the last n days
        """
        try:
            with open(self.metrics_file_path, 'r') as f:
                metrics = json.load(f)
            
            # Filter metrics for specified time range
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            recent_metrics = [
                m for m in metrics 
                if datetime.fromisoformat(m['timestamp']) > cutoff_date
            ]
            
            # Calculate aggregates
            report = {
                'total_tweets': len(recent_metrics),
                'avg_likes': sum(m['engagement']['likes'] for m in recent_metrics) / len(recent_metrics),
                'avg_retweets': sum(m['engagement']['retweets'] for m in recent_metrics) / len(recent_metrics),
                'top_sources': self._get_top_sources(recent_metrics)
            }
            
            return report
        
        except Exception as e:
            self.logger.error(f"Failed to generate performance report: {e}")
            return None

    def _get_top_sources(self, metrics):
        """
        Identify top performing sources
        """
        source_performance = {}
        for metric in metrics:
            source = metric['source']
            likes = metric['engagement']['likes']
            
            if source not in source_performance:
                source_performance[source] = {'total_likes': 0, 'tweet_count': 0}
            
            source_performance[source]['total_likes'] += likes
            source_performance[source]['tweet_count'] += 1
        
        # Sort sources by average likes
        sorted_sources = sorted(
            source_performance.items(), 
            key=lambda x: x[1]['total_likes'] / x[1]['tweet_count'], 
            reverse=True
        )
        
        return sorted_sources[:5]  # Top 5 sources

def main():
    logger = PerformanceLogger()
    
    # Example usage
    sample_tweet = {
        'id': '1234567890',
        'source': 'RobertsSpaceInd',
        'likes': 150,
        'retweets': 25,
        'replies': 10
    }
    
    logger.log_tweet_performance(sample_tweet)
    report = logger.generate_performance_report()
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()