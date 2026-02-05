class TelemetryCollector:
    def __init__(self, storage_dir='telemetry_data'):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)

    def log_execution(self, metrics):
        # Store raw metrics in a time-partitioned JSON file
        date_file = self.storage_dir / f'{datetime.now().date()}.jsonl'
        with open(date_file, 'a') as f:
            f.write(json.dumps({
                'timestamp': datetime.now().isoformat(),
                'model': metrics['model'],
                'provider': metrics.get('provider'),
                'latency': metrics['latency'],
                'tokens': {
                    'input': metrics.get('input_tokens', 0),
                    'output': metrics.get('output_tokens', 0)
                },
                'cost': metrics.get('cost', 0.0),
                'success': metrics['success'],
                'quality_score': metrics.get('quality_score')
            }) + '\n')

    def aggregate_daily(self, reference_date=None):
        # Calculate daily aggregates
        # This would process all entries for the given day
        # Implementation would read the day's JSONL file
        # and compute metrics like average latency, success rate, etc.
        pass

    def query(self, start_time=None, end_time=None, model=None):
        # Query interface
        # Returns generator of all matching records
        # Implementation would read relevant date files
        pass