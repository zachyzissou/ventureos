import json
import logging
from datetime import datetime
import os

class ConfigurationMerger:
    def __init__(self, original_config_path, current_config_path):
        # Setup logging
        log_dir = '/Users/zachgonser/clawd/logs/config_merger'
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f'config_merger_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        # Load configurations
        with open(original_config_path, 'r') as f:
            self.original_config = json.load(f)
        
        with open(current_config_path, 'r') as f:
            self.current_config = json.load(f)
        
        # Merge target
        self.merged_config = {}
    
    def _deep_merge(self, base, update):
        """Recursively merge two dictionaries"""
        if not isinstance(base, dict) or not isinstance(update, dict):
            return update
        
        merged = base.copy()
        for key, value in update.items():
            if key in merged:
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = value
        
        return merged
    
    def _identify_differences(self):
        """Identify and log configuration differences"""
        differences = {
            'added_keys': [],
            'modified_keys': [],
            'preserved_keys': []
        }
        
        def _recursive_diff_check(original, current, path=''):
            # Check original config keys
            for key, value in original.items():
                current_path = f"{path}.{key}" if path else key
                
                # Key exists in current config
                if key in current:
                    # If it's a dict, recursively check
                    if isinstance(value, dict) and isinstance(current[key], dict):
                        _recursive_diff_check(value, current[key], current_path)
                    # If values differ
                    elif value != current[key]:
                        differences['modified_keys'].append({
                            'path': current_path,
                            'original_value': value,
                            'current_value': current[key]
                        })
                    else:
                        differences['preserved_keys'].append(current_path)
                else:
                    # Key missing in current config
                    differences['added_keys'].append({
                        'path': current_path,
                        'value': value
                    })
            
            # Check current config for new keys not in original
            for key, value in current.items():
                current_path = f"{path}.{key}" if path else key
                if key not in original:
                    differences['added_keys'].append({
                        'path': current_path,
                        'value': value
                    })
        
        _recursive_diff_check(self.original_config, self.current_config)
        return differences
    
    def merge_configurations(self):
        """Merge configurations with strategic approach"""
        # Deep merge configurations
        self.merged_config = self._deep_merge(
            self.original_config, 
            self.current_config
        )
        
        # Identify differences
        differences = self._identify_differences()
        
        # Update metadata
        self.merged_config['meta']['migration_timestamp'] = datetime.now().isoformat()
        self.merged_config['meta']['migration_source'] = 'clawdbot-to-openclaw'
        
        # Logging
        logging.info("Configuration Merge Summary")
        logging.info(f"Added Keys: {len(differences['added_keys'])}")
        logging.info(f"Modified Keys: {len(differences['modified_keys'])}")
        logging.info(f"Preserved Keys: {len(differences['preserved_keys'])}")
        
        # Save merged configuration
        merged_config_path = f'/Users/zachgonser/.echo/openclaw_merged_config_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(merged_config_path, 'w') as f:
            json.dump(self.merged_config, f, indent=4)
        
        # Save differences report
        differences_report_path = f'/Users/zachgonser/clawd/logs/config_merger/config_differences_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(differences_report_path, 'w') as f:
            json.dump(differences, f, indent=4)
        
        logging.info(f"Merged configuration saved to: {merged_config_path}")
        logging.info(f"Configuration differences saved to: {differences_report_path}")
        
        return self.merged_config

def main():
    original_config = '/Users/zachgonser/Downloads/clawdbot-1/clawdbot.json'
    current_config = '/Users/zachgonser/.echo/echo.json'
    
    merger = ConfigurationMerger(original_config, current_config)
    merged_config = merger.merge_configurations()
    
    print(json.dumps(merged_config, indent=2))

if __name__ == '__main__':
    main()