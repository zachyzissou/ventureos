import json
import os
import re
from typing import Dict, List, Any
import logging

# Import new components
from ml_scorer import AdvancedContentScorer
from error_handler import StantonTimesErrorHandler
from permission_manager import StantonTimesPermissionManager
from system_monitor import StantonTimesSystemMonitor

class StantonTimesContentProcessor:
    def __init__(self, 
                 state_file_path, 
                 config_path='/Users/zachgonser/clawd/projects/stanton-times/config.json'):
        self.state_file_path = state_file_path
        self.config_path = config_path

        # Initialize advanced components
        self.ml_scorer = AdvancedContentScorer()
        self.error_handler = StantonTimesErrorHandler(config_path, '/Users/zachgonser/clawd/projects/stanton-times/logs/content_processor_errors.log')
        self.permission_manager = StantonTimesPermissionManager(config_path)
        self.system_monitor = StantonTimesSystemMonitor(config_path)

        # Load state and setup logging
        self.state = self._load_state()
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def _load_state(self):
        try:
            with open(self.state_file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {
                "content_intelligence": {
                    "scoring_weights": {
                        "developer_credibility": 0.4,
                        "community_engagement": 0.3,
                        "information_novelty": 0.2,
                        "technical_depth": 0.1
                    },
                    "draft_threshold": 0.7
                },
                "pending_stories": []
            }

    def _check_developer_credibility(self, content: Dict[str, Any]) -> float:
        """
        Assess the credibility of the content source
        """
        source_reliability = {
            "RobertsSpaceInd": 0.85,
            "starcitizenbot": 0.75,
            "TheRubenSaurus": 0.65
        }
        return source_reliability.get(content.get('source', ''), 0.5)

    def _estimate_community_interest(self, content: Dict[str, Any]) -> float:
        """
        Estimate potential community engagement
        """
        # Look for keywords that might indicate high interest
        high_interest_keywords = [
            'patch', 'update', 'new feature', 'roadmap', 
            'alpha', 'beta', 'release', 'improvement'
        ]
        
        description = content.get('description', '').lower()
        matches = sum(1 for keyword in high_interest_keywords if keyword in description)
        
        return min(matches * 0.2, 1.0)

    def _assess_information_novelty(self, content: Dict[str, Any]) -> float:
        """
        Check if the content offers new information
        """
        # Compare against previously seen content
        seen_ids = self.state.get('seen_tweet_ids', {})
        
        if content.get('id') in seen_ids.get(content.get('source', ''), []):
            return 0.1  # Low novelty if already seen
        
        return 0.8  # Assume novelty unless proven otherwise

    def _measure_technical_depth(self, content: Dict[str, Any]) -> float:
        """
        Assess the technical complexity of the content
        """
        technical_keywords = [
            'performance', 'optimization', 'networking', 
            'server meshing', 'technical', 'implementation'
        ]
        
        description = content.get('description', '').lower()
        matches = sum(1 for keyword in technical_keywords if keyword in description)
        
        return min(matches * 0.25, 1.0)

    def calculate_content_score(self, content: Dict[str, Any]) -> float:
        """
        Enhanced scoring using machine learning
        """
        try:
            # Use ML scorer for primary scoring
            ml_score = self.ml_scorer.score_content(content.get('description', ''))
            
            # Calculate traditional scoring
            weights = self.state['content_intelligence']['scoring_weights']
            
            traditional_scores = {
                "developer_credibility": self._check_developer_credibility(content),
                "community_engagement": self._estimate_community_interest(content),
                "information_novelty": self._assess_information_novelty(content),
                "technical_depth": self._measure_technical_depth(content)
            }
            
            traditional_score = sum(
                traditional_scores.get(key, 0) * weights.get(key, 0) 
                for key in weights
            )
            
            # Weighted combination
            final_score = (ml_score * 0.6) + (traditional_score * 0.4)
            
            return final_score
        except Exception as e:
            # Error handling with fallback
            error_details = self.error_handler.handle_error('content_scoring', e, content)
            
            if error_details['action'] == 'continue':
                # Fallback to traditional scoring
                traditional_score = sum(
                    getattr(self, f'_{method}')(content) * self.state['content_intelligence']['scoring_weights'].get(method, 0)
                    for method in ['check_developer_credibility', 'estimate_community_interest', 'assess_information_novelty', 'measure_technical_depth']
                )
                return traditional_score
            
            raise

    def process_content(self, content: Dict[str, Any], user_id: str = None) -> Dict[str, Any]:
        """
        Enhanced content processing with permission checks
        """
        # Optional user permission check
        if user_id and not self.permission_manager.check_permission(user_id, 'submit_draft'):
            self.logger.warning(f"Unauthorized draft submission attempt by {user_id}")
            return {
                "status": "unauthorized",
                "message": "You do not have permission to submit drafts"
            }

        try:
            # Score content
            score = self.calculate_content_score(content)
            
            # Check system health before processing
            health_report = self.system_monitor.generate_health_report()
            
            # Abort if system resources are critically low
            if health_report['system_resources']['cpu_usage'] > 90:
                return {
                    "status": "system_overload",
                    "message": "System resources too low to process content"
                }

            # Existing draft generation logic
            draft_threshold = self.state['content_intelligence']['draft_threshold']
            
            if score >= draft_threshold:
                self.logger.info(f"Content draft generated. Score: {score}")
                
                # Generate tweet draft
                tweet_draft = self._generate_tweet_draft(content)
                
                # Update state
                self._update_state(content, score, tweet_draft)
                
                # Optional: Update ML model with successful draft
                self.ml_scorer.update_model([content.get('description', '')], [score])
                
                return {
                    "status": "draft_ready",
                    "score": score,
                    "tweet_draft": tweet_draft
                }
            else:
                self.logger.info(f"Content below threshold. Score: {score}")
                return {
                    "status": "below_threshold",
                    "score": score
                }
        
        except Exception as e:
            # Comprehensive error handling
            error_details = self.error_handler.handle_error('content_processing', e, content)
            
            # Log permission audit
            if user_id:
                self.permission_manager.audit_log(user_id, 'draft_submission', 'error')
            
            return {
                "status": "error",
                "error_details": error_details
            }

    def _generate_tweet_draft(self, content: Dict[str, Any]) -> str:
        """
        Generate a draft tweet based on content
        """
        description = content.get('description', '')
        
        # Basic tweet generation - to be made more sophisticated
        tweet = f"🚀 Star Citizen Update: {description[:200]}..."
        
        return tweet

    def _update_state(self, content: Dict[str, Any], score: float, tweet_draft: str):
        """
        Update the state file with processed content
        """
        # Add to pending stories
        self.state['pending_stories'].append({
            "topic": content.get('topic', 'Untitled'),
            "source": content.get('source', 'Unknown'),
            "content_score": score,
            "tweet_draft": tweet_draft,
            "draft_status": "needs_review"
        })
        
        # Save state
        with open(self.state_file_path, 'w') as f:
            json.dump(self.state, f, indent=2)

def main():
    processor = StantonTimesContentProcessor('/Users/zachgonser/clawd/memory/stanton-times/state.json')
    
    # Example content with optional user ID
    test_content = {
        "source": "RobertsSpaceInd",
        "topic": "February 2026 Preview",
        "description": "Upcoming developments and community insights for February 2026 featuring server performance updates",
        "id": "2017722468195033462"
    }
    
    result = processor.process_content(test_content, user_id='956203522624462918')
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()