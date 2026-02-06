import unittest
import json
from src.content_processor import StantonTimesContentProcessor

class TestContentProcessor(unittest.TestCase):
    def setUp(self):
        self.processor = StantonTimesContentProcessor()

    def test_score_calculation(self):
        # Test content scoring mechanism
        test_contents = [
            {
                "source": "RobertsSpaceInd",
                "description": "New server meshing technology deployed in Alpha 4.6",
                "id": "test_1"
            },
            {
                "source": "starcitizenbot",
                "description": "Minor bug fix released",
                "id": "test_2"
            }
        ]

        for content in test_contents:
            result = self.processor.process_content(content)
            
            # Validate result structure
            self.assertIn('status', result)
            self.assertIn('score', result)
            
            # Verify score is within expected range
            self.assertTrue(0 <= result['score'] <= 1)

    def test_draft_generation(self):
        # Test tweet draft generation
        test_content = {
            "source": "RobertsSpaceInd",
            "topic": "Server Meshing Update",
            "description": "Major breakthrough in server meshing technology for Star Citizen Alpha 4.6",
            "id": "server_meshing_test"
        }

        result = self.processor.process_content(test_content)
        
        # Check draft generation for high-scoring content
        if result['status'] == 'draft_ready':
            draft = result.get('tweet_draft', '')
            self.assertTrue(len(draft) > 0)
            self.assertTrue(len(draft) <= 280)  # Twitter character limit

    def test_source_reliability(self):
        # Test source reliability scoring
        test_sources = [
            "RobertsSpaceInd",
            "starcitizenbot", 
            "TheRubenSaurus",
            "UnknownSource"
        ]

        for source in test_sources:
            content = {
                "source": source,
                "description": "Test content for source reliability",
                "id": f"source_test_{source}"
            }
            
            result = self.processor.process_content(content)
            
            # Verify scoring behavior
            self.assertIn('score', result)

    def test_state_update(self):
        # Test if state is updated correctly
        test_content = {
            "source": "RobertsSpaceInd",
            "topic": "Major Update Test",
            "description": "Comprehensive server meshing technology with major performance improvements",
            "id": "test_tweet_id_123"
        }

        # Process content
        result = self.processor.process_content(test_content)

        # If content meets draft threshold, state should be updated
        if result.get('status') == 'draft_ready':
            # Reload state to verify update
            with open(self.processor.state_file_path, 'r') as f:
                updated_state = json.load(f)
            
            # Check if pending stories have been updated
            pending_stories = updated_state.get('pending_stories', [])
            
            # Look for the specific content
            test_stories = [
                story for story in pending_stories 
                if 'server meshing technology' in story.get('description', '')
            ]
            
            self.assertTrue(len(test_stories) > 0, "State not updated with new story")

if __name__ == '__main__':
    unittest.main()
