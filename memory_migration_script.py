import os
import sqlite3
import json
import shutil
from datetime import datetime

def create_life_areas_structure():
    """Create basic life areas structure if not exists"""
    base_path = '/Users/zachgonser/clawd/life/areas'
    subdirs = ['people', 'companies', 'projects', 'sessions']
    
    for subdir in subdirs:
        full_path = os.path.join(base_path, subdir)
        os.makedirs(full_path, exist_ok=True)
    
    # Create a README
    readme_path = os.path.join(base_path, 'README.md')
    readme_content = """# Life Areas Knowledge Graph

This is a three-layer memory system for persistent, evolving knowledge.

## Structure
- people/: Entities and relationships
- companies/: Work and organizational contexts
- projects/: Active and historical projects
- sessions/: Agent session insights

Automatically maintained by OpenClaw's memory system.
"""
    
    with open(readme_path, 'w') as f:
        f.write(readme_content)

class MemoryMigrator:
    def __init__(self, source_db_path, destination_db_path):
        self.source_db_path = source_db_path
        self.destination_db_path = destination_db_path
        
        # Setup logging
        self.log_path = '/Users/zachgonser/clawd/memory_migration.log'
        with open(self.log_path, 'w') as log_file:
            log_file.write(f"Memory Migration Log - {datetime.now().isoformat()}\n")
        
    def _log(self, message):
        """Log messages to migration log file"""
        with open(self.log_path, 'a') as log_file:
            log_file.write(f"{datetime.now().isoformat()} - {message}\n")
    
    def _copy_database_with_backup(self):
        """Create a backup of the destination database before copying"""
        try:
            if os.path.exists(self.destination_db_path):
                backup_path = f"{self.destination_db_path}.backup-{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                shutil.copy2(self.destination_db_path, backup_path)
                self._log(f"Created database backup: {backup_path}")
        except Exception as e:
            self._log(f"Error creating database backup: {e}")
    
    def migrate_chunks(self):
        """Migrate memory chunks from source to destination database"""
        try:
            # Create backup
            self._copy_database_with_backup()
            
            # Connect to source and destination databases
            source_conn = sqlite3.connect(self.source_db_path)
            dest_conn = sqlite3.connect(self.destination_db_path)
            
            source_cursor = source_conn.cursor()
            dest_cursor = dest_conn.cursor()
            
            # Retrieve all chunks from source
            source_cursor.execute("SELECT * FROM chunks")
            chunks = source_cursor.fetchall()
            
            # Get column names
            source_cursor.execute("PRAGMA table_info(chunks)")
            columns = [column[1] for column in source_cursor.fetchall()]
            
            # Prepare insert statement
            placeholders = ','.join(['?'] * len(columns))
            insert_query = f"INSERT OR REPLACE INTO chunks ({','.join(columns)}) VALUES ({placeholders})"
            
            # Insert chunks into destination database
            dest_cursor.executemany(insert_query, chunks)
            
            # Commit changes
            dest_conn.commit()
            
            self._log(f"Migrated {len(chunks)} memory chunks")
            
            # Close connections
            source_conn.close()
            dest_conn.close()
            
            return len(chunks)
        
        except Exception as e:
            self._log(f"Error migrating chunks: {e}")
            return 0
    
    def migrate_files(self):
        """Migrate file metadata from source to destination database"""
        try:
            # Connect to source and destination databases
            source_conn = sqlite3.connect(self.source_db_path)
            dest_conn = sqlite3.connect(self.destination_db_path)
            
            source_cursor = source_conn.cursor()
            dest_cursor = dest_conn.cursor()
            
            # Retrieve all files from source
            source_cursor.execute("SELECT * FROM files")
            files = source_cursor.fetchall()
            
            # Get column names
            source_cursor.execute("PRAGMA table_info(files)")
            columns = [column[1] for column in source_cursor.fetchall()]
            
            # Prepare insert statement
            placeholders = ','.join(['?'] * len(columns))
            insert_query = f"INSERT OR REPLACE INTO files ({','.join(columns)}) VALUES ({placeholders})"
            
            # Insert files into destination database
            dest_cursor.executemany(insert_query, files)
            
            # Commit changes
            dest_conn.commit()
            
            self._log(f"Migrated {len(files)} file metadata entries")
            
            # Close connections
            source_conn.close()
            dest_conn.close()
            
            return len(files)
        
        except Exception as e:
            self._log(f"Error migrating files: {e}")
            return 0
    
    def migrate_embedding_cache(self):
        """Migrate embedding cache from source to destination database"""
        try:
            # Connect to source and destination databases
            source_conn = sqlite3.connect(self.source_db_path)
            dest_conn = sqlite3.connect(self.destination_db_path)
            
            source_cursor = source_conn.cursor()
            dest_cursor = dest_conn.cursor()
            
            # Retrieve all embedding cache entries from source
            source_cursor.execute("SELECT * FROM embedding_cache")
            embeddings = source_cursor.fetchall()
            
            # Get column names
            source_cursor.execute("PRAGMA table_info(embedding_cache)")
            columns = [column[1] for column in source_cursor.fetchall()]
            
            # Prepare insert statement
            placeholders = ','.join(['?'] * len(columns))
            insert_query = f"INSERT OR REPLACE INTO embedding_cache ({','.join(columns)}) VALUES ({placeholders})"
            
            # Insert embedding cache entries into destination database
            dest_cursor.executemany(insert_query, embeddings)
            
            # Commit changes
            dest_conn.commit()
            
            self._log(f"Migrated {len(embeddings)} embedding cache entries")
            
            # Close connections
            source_conn.close()
            dest_conn.close()
            
            return len(embeddings)
        
        except Exception as e:
            self._log(f"Error migrating embedding cache: {e}")
            return 0
    
    def migrate_meta_info(self):
        """Migrate metadata from source to destination database"""
        try:
            # Connect to source and destination databases
            source_conn = sqlite3.connect(self.source_db_path)
            dest_conn = sqlite3.connect(self.destination_db_path)
            
            source_cursor = source_conn.cursor()
            dest_cursor = dest_conn.cursor()
            
            # Retrieve all metadata from source
            source_cursor.execute("SELECT * FROM meta")
            meta_entries = source_cursor.fetchall()
            
            # Get column names
            source_cursor.execute("PRAGMA table_info(meta)")
            columns = [column[1] for column in source_cursor.fetchall()]
            
            # Prepare insert statement
            placeholders = ','.join(['?'] * len(columns))
            insert_query = f"INSERT OR REPLACE INTO meta ({','.join(columns)}) VALUES ({placeholders})"
            
            # Insert metadata into destination database
            dest_cursor.executemany(insert_query, meta_entries)
            
            # Commit changes
            dest_conn.commit()
            
            self._log(f"Migrated {len(meta_entries)} metadata entries")
            
            # Close connections
            source_conn.close()
            dest_conn.close()
            
            return len(meta_entries)
        
        except Exception as e:
            self._log(f"Error migrating metadata: {e}")
            return 0

def main():
    # Paths for source and destination databases
    source_main_db = '/Users/zachgonser/Downloads/openclaw-1/memory/main.sqlite'
    destination_main_db = '/Users/zachgonser/clawd/memory/main.sqlite'
    
    # Create life areas structure
    create_life_areas_structure()
    
    # Initialize migrator
    migrator = MemoryMigrator(source_main_db, destination_main_db)
    
    # Migrate databases
    print("Migrating SQLite databases...")
    chunks_count = migrator.migrate_chunks()
    files_count = migrator.migrate_files()
    embeddings_count = migrator.migrate_embedding_cache()
    meta_count = migrator.migrate_meta_info()
    
    # Generate and print migration summary
    migration_summary = {
        "timestamp": datetime.now().isoformat(),
        "chunks_migrated": chunks_count,
        "files_migrated": files_count,
        "embeddings_migrated": embeddings_count,
        "meta_entries_migrated": meta_count
    }
    
    print("\nMigration Summary:")
    print(json.dumps(migration_summary, indent=2))

if __name__ == '__main__':
    main()