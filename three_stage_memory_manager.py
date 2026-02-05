import os
import re
import json
import shutil
from datetime import datetime, timedelta

class ThreeStageMemoryManager:
    def __init__(self):
        # Core paths
        self.base_path = '/Users/zachgonser/clawd'
        self.memory_dir = os.path.join(self.base_path, 'memory')
        self.archives_dir = os.path.join(self.memory_dir, 'archives')
        self.memory_file = os.path.join(self.base_path, 'MEMORY.md')
        
        # Ensure directories exist
        os.makedirs(self.memory_dir, exist_ok=True)
        os.makedirs(self.archives_dir, exist_ok=True)
    
    def _get_daily_memory_files(self):
        """Retrieve all daily memory log files with robust parsing"""
        return sorted([
            f for f in os.listdir(self.memory_dir) 
            if re.match(r'\d{4}-\d{2}-\d{2}(-\w+)?\.md$', f)
        ])
    
    def _parse_date_from_filename(self, filename):
        """Robustly parse date from filename"""
        match = re.match(r'(\d{4}-\d{2}-\d{2})(-\w+)?\.md$', filename)
        if match:
            return datetime.strptime(match.group(1), '%Y-%m-%d')
        return None
    
    def stage_one_daily_logging(self):
        """Stage 1: Daily Raw Logging
        Create or update today's daily memory log"""
        today = datetime.now().strftime('%Y-%m-%d')
        daily_log_path = os.path.join(self.memory_dir, f'{today}.md')
        
        # If log doesn't exist, create with basic template
        if not os.path.exists(daily_log_path):
            with open(daily_log_path, 'w') as f:
                f.write(f"# {today} Memory Log\n\n## System Events\n\n## Interactions\n")
        
        return daily_log_path
    
    def stage_two_curation(self):
        """Stage 2: Periodic Curation
        Review and distill insights from daily logs into MEMORY.md"""
        daily_files = self._get_daily_memory_files()
        
        # Collect significant insights
        insights = []
        for file in daily_files[-7:]:  # Look at last 7 days
            file_path = os.path.join(self.memory_dir, file)
            with open(file_path, 'r') as f:
                content = f.read()
                # Extract significant events or insights
                if '## System Events' in content or '## Interactions' in content:
                    insights.append(f"### {file}\n{content}")
        
        # Update MEMORY.md with curated insights
        with open(self.memory_file, 'w') as f:
            f.write("# Curated Memory Log\n\n")
            f.write("\n\n".join(insights))
    
    def stage_three_archiving(self):
        """Stage 3: Long-term Archiving
        Move old daily logs to archives and clean up"""
        daily_files = self._get_daily_memory_files()
        
        # Archive files older than 30 days
        cutoff_date = datetime.now() - timedelta(days=30)
        
        for file in daily_files:
            file_path = os.path.join(self.memory_dir, file)
            file_date = self._parse_date_from_filename(file)
            
            if file_date and file_date < cutoff_date:
                archive_path = os.path.join(self.archives_dir, file)
                shutil.move(file_path, archive_path)
    
    def run_memory_management(self):
        """Execute full memory management workflow"""
        # Stage 1: Daily Logging
        daily_log = self.stage_one_daily_logging()
        
        # Stage 2: Curation
        self.stage_two_curation()
        
        # Stage 3: Archiving
        self.stage_three_archiving()
        
        return {
            'daily_log': daily_log,
            'timestamp': datetime.now().isoformat()
        }

def main():
    memory_manager = ThreeStageMemoryManager()
    memory_manager.run_memory_management()

if __name__ == '__main__':
    main()