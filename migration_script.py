import json
import sqlite3
from datetime import datetime
from typing import Dict, Any

class ProjectContextMigrator:
    def __init__(self, source_system: str, target_system: str):
        """
        Initialize project context migrator
        
        :param source_system: Origin project management system
        :param target_system: Destination project management system
        """
        self.source_system = source_system
        self.target_system = target_system
        self.context_db = sqlite3.connect('project_context.sqlite')
        self.setup_context_database()

    def setup_context_database(self):
        """Create database to store migrated project contexts"""
        cursor = self.context_db.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS project_contexts (
                project_id TEXT PRIMARY KEY,
                source_system TEXT,
                target_system TEXT,
                metadata JSON,
                migration_timestamp DATETIME
            )
        ''')
        self.context_db.commit()

    def extract_project_metadata(self, project_id: str) -> Dict[str, Any]:
        """
        Extract comprehensive project metadata
        
        :param project_id: Unique identifier for the project
        :return: Dictionary of project metadata
        """
        # Placeholder for actual metadata extraction logic
        # This would connect to source system and retrieve project details
        return {
            'id': project_id,
            'name': f'Project {project_id}',
            'created_at': datetime.now().isoformat(),
            'description': 'Project migrated from legacy system',
            'original_owners': ['admin@company.com'],
            'tags': ['migrated', 'legacy-system'],
            'historical_context': {
                'initial_goals': ['Preserve project history'],
                'key_decisions': ['Migrate to new platform'],
                'dependencies': []
            }
        }

    def translate_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Translate metadata between different project management systems
        
        :param metadata: Original project metadata
        :return: Translated metadata for target system
        """
        # Mapping logic to adapt metadata to target system's requirements
        return {
            'project_name': metadata['name'],
            'description': metadata['description'],
            'created': metadata['created_at'],
            'owners': metadata['original_owners'],
            'custom_fields': {
                'migration_source': self.source_system,
                'original_project_id': metadata['id'],
                'historical_context': json.dumps(metadata['historical_context'])
            }
        }

    def migrate_project(self, project_id: str):
        """
        Migrate project context from source to target system
        
        :param project_id: Project to migrate
        """
        # Extract metadata from source system
        metadata = self.extract_project_metadata(project_id)
        
        # Translate metadata for target system
        translated_metadata = self.translate_metadata(metadata)
        
        # Store migration context in SQLite database
        cursor = self.context_db.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO project_contexts 
            (project_id, source_system, target_system, metadata, migration_timestamp)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            project_id, 
            self.source_system, 
            self.target_system, 
            json.dumps(translated_metadata), 
            datetime.now().isoformat()
        ))
        self.context_db.commit()
        
        print(f"Successfully migrated project {project_id}")

    def migrate_multiple_projects(self, project_ids: list):
        """
        Migrate multiple projects
        
        :param project_ids: List of project identifiers to migrate
        """
        for project_id in project_ids:
            try:
                self.migrate_project(project_id)
            except Exception as e:
                print(f"Migration failed for project {project_id}: {e}")

def main():
    # Example usage
    migrator = ProjectContextMigrator(
        source_system='legacy_pm_tool', 
        target_system='openproject'
    )
    
    # Migrate 10 hypothetical projects
    project_ids = [f'PROJ_{str(i).zfill(3)}' for i in range(1, 11)]
    migrator.migrate_multiple_projects(project_ids)

if __name__ == '__main__':
    main()