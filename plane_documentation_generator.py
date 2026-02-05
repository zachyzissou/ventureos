#!/usr/bin/env python3
import os
import json
from datetime import datetime

class PlaneDocumentationGenerator:
    def __init__(self, project_id):
        """
        Initialize documentation generator for a specific project
        
        Args:
            project_id (str): UUID of the project
        """
        self.project_id = project_id
        self.documentation = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'project_id': project_id
            },
            'workflow': {
                'states': [
                    {
                        "name": "Backlog",
                        "description": "Initial collection of potential work items, awaiting prioritization",
                        "purpose": "Capture and organize new ideas and requirements"
                    },
                    {
                        "name": "Refined",
                        "description": "Work items with clear requirements, ready for estimation",
                        "purpose": "Prepare work items for sprint planning"
                    }
                ],
                'work_item_types': [
                    {
                        "name": "Feature",
                        "description": "New product capability",
                        "documentation_guidelines": [
                            "Provide clear user story",
                            "Define acceptance criteria"
                        ]
                    },
                    {
                        "name": "Bug",
                        "description": "Defect requiring resolution",
                        "documentation_guidelines": [
                            "Provide reproducible steps",
                            "Include environment details"
                        ]
                    }
                ]
            },
            'guidelines': {
                'development_process': [
                    {
                        "section": "Code Quality",
                        "guidelines": [
                            "Follow SOLID principles",
                            "Maintain clean, readable code"
                        ]
                    }
                ],
                'quality_standards': [
                    {
                        "metric": "Test Coverage",
                        "minimum_threshold": "80%"
                    }
                ]
            }
        }
    
    def generate_documentation(self):
        """
        Generate comprehensive project documentation
        """
        # Ensure documentation directory exists
        os.makedirs('/Users/zachgonser/clawd/documentation/plane', exist_ok=True)
        
        # JSON documentation
        json_path = '/Users/zachgonser/clawd/documentation/plane/project_documentation.json'
        with open(json_path, 'w') as f:
            json.dump(self.documentation, f, indent=2)
        
        # Plain text documentation
        txt_path = '/Users/zachgonser/clawd/documentation/plane/README.txt'
        with open(txt_path, 'w') as f:
            f.write("# Plane Project Management Documentation\n\n")
            
            f.write("## Workflow States\n\n")
            for state in self.documentation['workflow']['states']:
                f.write(f"### {state['name']}\n")
                f.write(f"Description: {state['description']}\n")
                f.write(f"Purpose: {state['purpose']}\n\n")
            
            f.write("## Work Item Types\n\n")
            for item_type in self.documentation['workflow']['work_item_types']:
                f.write(f"### {item_type['name']}\n")
                f.write(f"Description: {item_type['description']}\n")
                f.write("Documentation Guidelines:\n")
                for guideline in item_type['documentation_guidelines']:
                    f.write(f"- {guideline}\n")
                f.write("\n")
        
        return self.documentation

def main():
    project_id = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
    doc_generator = PlaneDocumentationGenerator(project_id)
    doc_generator.generate_documentation()
    print("Project documentation generated successfully.")

if __name__ == "__main__":
    main()