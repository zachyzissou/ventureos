import os
import re
import json
import logging
from datetime import datetime

class StrategicReferenceReplacer:
    def __init__(self):
        # Comprehensive logging setup
        log_dir = '/Users/zachgonser/clawd/logs/reference_replacement'
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f'reference_replacement_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        # Strategic replacement mapping with context-aware rules
        self.replacement_map = {
            'openclaw': 'openclaw',
            'OpenClaw': 'OpenClaw',
            'OPENCLAW': 'OPENCLAW',
            'openclaw': 'openclaw',
            'OpenClaw': 'OpenClaw',
            'OPENCLAW': 'OPENCLAW'
        }
        
        # Directories to search (strategic, targeted approach)
        self.search_dirs = [
            '/Users/zachgonser/clawd',
            '/Users/zachgonser/.echo',
            '/Users/zachgonser/Library'
        ]
        
        # File types to consider (strategic selection)
        self.file_types = [
            '.json', '.yaml', '.yml', '.toml', 
            '.sh', '.py', '.txt', '.md', 
            '.conf', '.cfg', '.plist'
        ]
        
        # Exclusion patterns (protect sensitive or historical content)
        self.exclusion_patterns = [
            r'memory/archives/',  # Preserve historical logs
            r'migration_',         # Keep migration documentation
            r'bot_reference_update_',  # Protect existing logs
            r'MEMORY.md'           # Critical memory file
        ]
    
    def _should_process_file(self, file_path):
        """Determine if file should be processed"""
        # Check file extension
        if not any(file_path.endswith(ext) for ext in self.file_types):
            return False
        
        # Check exclusion patterns
        for pattern in self.exclusion_patterns:
            if re.search(pattern, file_path):
                logging.info(f"Skipping protected file: {file_path}")
                return False
        
        return True
    
    def _safe_replace(self, content):
        """Perform safe, context-aware replacements"""
        replaced_content = content
        replacement_details = {}
        
        for old_name, new_name in self.replacement_map.items():
            # Use word boundaries to prevent partial matches
            pattern = r'\b{}\b'.format(re.escape(old_name))
            matches = re.findall(pattern, replaced_content)
            
            if matches:
                replaced_content = re.sub(pattern, new_name, replaced_content)
                replacement_details[old_name] = {
                    'count': len(matches),
                    'new_name': new_name
                }
        
        return replaced_content, replacement_details
    
    def process_file(self, file_path):
        """Process a single file with strategic replacement"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
            
            # Perform safe replacement
            new_content, replacement_details = self._safe_replace(original_content)
            
            # Only write if changes occurred
            if replacement_details:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                
                logging.info(f"Replaced references in: {file_path}")
                logging.info(f"Replacement details: {json.dumps(replacement_details, indent=2)}")
                
                return replacement_details
            
            return {}
        
        except Exception as e:
            logging.error(f"Error processing {file_path}: {e}")
            return {}
    
    def strategic_replacement(self):
        """Comprehensive, strategic reference replacement"""
        total_replacements = {
            'files_processed': 0,
            'files_modified': 0,
            'total_replacements': {}
        }
        
        # Walk through directories
        for search_dir in self.search_dirs:
            if not os.path.exists(search_dir):
                logging.warning(f"Directory not found: {search_dir}")
                continue
            
            for root, _, files in os.walk(search_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    
                    if self._should_process_file(file_path):
                        total_replacements['files_processed'] += 1
                        
                        # Process file
                        file_replacements = self.process_file(file_path)
                        
                        if file_replacements:
                            total_replacements['files_modified'] += 1
                            
                            # Aggregate replacements
                            for old_name, details in file_replacements.items():
                                if old_name not in total_replacements['total_replacements']:
                                    total_replacements['total_replacements'][old_name] = 0
                                total_replacements['total_replacements'][old_name] += details['count']
        
        # Generate comprehensive report
        report_path = f'/Users/zachgonser/clawd/strategic_reference_replacement_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(total_replacements, f, indent=2)
        
        logging.info(f"Strategic reference replacement complete. Report saved: {report_path}")
        
        return total_replacements

def main():
    replacer = StrategicReferenceReplacer()
    replacer.strategic_replacement()

if __name__ == '__main__':
    main()