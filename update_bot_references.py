import os
import re
import json
import logging
from typing import List, Dict

class BotReferenceUpdater:
    def __init__(self):
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            filename='/Users/zachgonser/clawd/bot_reference_update.log'
        )
        
        # Directories to search
        self.search_dirs = [
            '/Users/zachgonser/clawd',
            '/Users/zachgonser/.openclaw',
            '/Users/zachgonser/.config',
            '/Users/zachgonser/Library'
        ]
        
        # File types to search and modify
        self.file_types = [
            '.json', '.yaml', '.yml', '.toml', '.sh', 
            '.py', '.txt', '.md', '.conf', '.cfg'
        ]
        
        # Replacement mappings
        self.replacements = {
            'openclaw': 'openclaw',
            'OpenClaw': 'OpenClaw',
            'openclaw': 'openclaw',
            'OpenClaw': 'OpenClaw',
            'openclaw': 'openclaw',
            'OpenClaw': 'OpenClaw'
        }
    
    def _find_files(self) -> List[str]:
        """Recursively find files to process"""
        matching_files = []
        
        for search_dir in self.search_dirs:
            if not os.path.exists(search_dir):
                logging.warning(f"Directory not found: {search_dir}")
                continue
            
            for root, _, files in os.walk(search_dir):
                for file in files:
                    # Check file extension
                    if any(file.endswith(ext) for ext in self.file_types):
                        full_path = os.path.join(root, file)
                        matching_files.append(full_path)
        
        return matching_files
    
    def _update_file_content(self, file_path: str) -> Dict:
        """Update content of a single file"""
        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
            
            # Track changes
            changes = {}
            modified_content = original_content
            
            # Perform replacements
            for old, new in self.replacements.items():
                if old in modified_content:
                    modified_content = modified_content.replace(old, new)
                    changes[old] = new
            
            # Write back if changes were made
            if changes:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(modified_content)
                
                logging.info(f"Updated file: {file_path}")
                logging.info(f"Changes: {json.dumps(changes, indent=2)}")
            
            return changes
        
        except Exception as e:
            logging.error(f"Error processing {file_path}: {e}")
            return {}
    
    def update_references(self) -> Dict:
        """Main method to update bot references"""
        # Find all files
        files_to_process = self._find_files()
        
        # Track overall changes
        total_changes = {
            'files_processed': len(files_to_process),
            'files_modified': 0,
            'total_replacements': {}
        }
        
        # Process each file
        for file_path in files_to_process:
            file_changes = self._update_file_content(file_path)
            
            if file_changes:
                total_changes['files_modified'] += 1
                for old, new in file_changes.items():
                    if old not in total_changes['total_replacements']:
                        total_changes['total_replacements'][old] = 0
                    total_changes['total_replacements'][old] += 1
        
        # Generate and save report
        report_path = '/Users/zachgonser/clawd/bot_reference_update_report.json'
        with open(report_path, 'w') as f:
            json.dump(total_changes, f, indent=2)
        
        logging.info(f"Update complete. Report saved to {report_path}")
        return total_changes

def main():
    updater = BotReferenceUpdater()
    updater.update_references()

if __name__ == '__main__':
    main()