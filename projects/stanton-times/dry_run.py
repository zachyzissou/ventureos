import json
import logging
from datetime import datetime

from src.config import ensure_state_file, get_config_path, get_log_path
from src.state.store import load_state, save_state

class DryRunProcessor:
    def __init__(self, config_path=None):
        # Load configuration
        config_path = config_path or str(get_config_path())
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - DRY RUN - %(message)s',
            filename=get_log_path('dry_run.log')
        )
        self.logger = logging.getLogger(__name__)

    def simulate_tweet_processing(self):
        """
        Simulate tweet processing without actual publication
        """
        # Simulated test content
        test_contents = [
            {
                "source": "RobertsSpaceInd",
                "topic": "Server Meshing Update",
                "description": "Major breakthrough in server meshing technology for Star Citizen Alpha 4.6",
                "id": "test_server_meshing"
            },
            {
                "source": "starcitizenbot",
                "topic": "Patch Notes",
                "description": "Alpha 4.6 patch notes released with significant performance improvements",
                "id": "test_patch_notes"
            }
        ]

        processed_contents = []

        for content in test_contents:
            # Simulate content processing
            score = self._calculate_mock_score(content)
            
            processed_content = {
                "source": content["source"],
                "topic": content["topic"],
                "description": content["description"],
                "score": score,
                "draft_status": "needs_review" if score > 0.7 else "below_threshold",
                "simulated_draft": self._generate_mock_draft(content) if score > 0.7 else None
            }

            processed_contents.append(processed_content)
            
            # Log processing details
            self.logger.info(f"Processed content from {content['source']}: Score = {score}")

        return processed_contents

    def _calculate_mock_score(self, content):
        """
        Mock scoring mechanism
        """
        scoring_map = {
            "RobertsSpaceInd": 0.9,
            "starcitizenbot": 0.8,
            "TheRubenSaurus": 0.7
        }

        # Base score from source
        base_score = scoring_map.get(content["source"], 0.5)

        # Adjust score based on content keywords
        keywords = {
            "server meshing": 0.2,
            "patch notes": 0.1,
            "performance": 0.1
        }

        for keyword, boost in keywords.items():
            if keyword in content["description"].lower():
                base_score += boost

        return min(base_score, 1.0)

    def _generate_mock_draft(self, content):
        """
        Generate a mock tweet draft
        """
        draft_template = "{headline} 🚀\n\n{description}\n\n#StarCitizen #{source}"
        
        return draft_template.format(
            headline=content["topic"],
            description=content["description"][:200] + "...",
            source=content["source"]
        )

    def generate_dry_run_report(self, processed_contents):
        """
        Generate a comprehensive dry run report
        """
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "total_contents": len(processed_contents),
            "processed_contents": processed_contents,
            "summary": {
                "above_threshold": sum(1 for content in processed_contents if content["draft_status"] == "needs_review"),
                "below_threshold": sum(1 for content in processed_contents if content["draft_status"] == "below_threshold")
            }
        }

        # Write report to file
        with open(get_log_path('dry_run_report.json'), 'w') as f:
            json.dump(report, f, indent=2)

        return report

def update_state_file(processed_contents):
    """
    Update the state file with processed contents for Discord verification
    """
    state_file_path = str(ensure_state_file())
    state = load_state(state_file_path)

    # Add processed contents to pending stories
    state['pending_stories'] = processed_contents
    save_state(state_file_path, state)

def main():
    dry_run = DryRunProcessor()
    
    # Run dry run simulation
    processed_contents = dry_run.simulate_tweet_processing()
    
    # Generate report
    report = dry_run.generate_dry_run_report(processed_contents)
    
    # Update state file for Discord verification
    update_state_file(processed_contents)
    
    # Print summary
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
