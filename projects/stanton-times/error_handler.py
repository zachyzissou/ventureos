import logging
import traceback
import json
from datetime import datetime, timedelta

from src.config import PROJECT_ROOT, get_config_path, get_log_path, get_state_path

class StantonTimesErrorHandler:
    def __init__(self, config_path, error_log_path):
        # Load configuration
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Logging setup
        logging.basicConfig(
            level=logging.ERROR,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            filename=error_log_path
        )
        self.logger = logging.getLogger('StantonTimesErrorHandler')
        
        # Error tracking
        self.error_threshold = self.config.get('error_handling', {}).get('threshold', 3)
        self.error_window = timedelta(hours=1)
        self.recent_errors = []

    def handle_error(self, component, error, context=None):
        """
        Comprehensive error handling with intelligent recovery
        """
        # Log the error
        error_details = {
            'timestamp': datetime.utcnow(),
            'component': component,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'traceback': traceback.format_exc(),
            'context': context
        }
        
        # Log to file
        self.logger.error(json.dumps(error_details, default=str))
        
        # Track recent errors
        self._track_error(error_details)
        
        # Determine recovery strategy
        recovery_action = self._determine_recovery_action(component)
        
        return recovery_action

    def _track_error(self, error_details):
        """
        Track recent errors and clean up old entries
        """
        current_time = datetime.utcnow()
        
        # Remove old errors
        self.recent_errors = [
            error for error in self.recent_errors 
            if current_time - error['timestamp'] < self.error_window
        ]
        
        # Add current error
        self.recent_errors.append(error_details)

    def _determine_recovery_action(self, component):
        """
        Intelligent error recovery based on error frequency and component
        """
        # Count errors for this component in the recent window
        component_errors = [
            error for error in self.recent_errors 
            if error['component'] == component
        ]
        
        if len(component_errors) >= self.error_threshold:
            # Multiple errors in short time - take more aggressive action
            recovery_actions = {
                'bird_monitor': self._bird_monitor_recovery,
                'discord_verifier': self._discord_verifier_recovery,
                'content_processor': self._content_processor_recovery
            }
            
            recovery_func = recovery_actions.get(component, self._default_recovery)
            return recovery_func()
        
        return {'action': 'continue', 'message': 'Monitoring'}

    def _bird_monitor_recovery(self):
        """
        Specific recovery for bird monitor
        """
        return {
            'action': 'restart',
            'message': 'Restarting bird monitor due to persistent errors',
            'commands': [
                'pkill -f bird_monitor.py',
                f"python3 {PROJECT_ROOT / 'bird_monitor.py'}"
            ]
        }

    def _discord_verifier_recovery(self):
        """
        Specific recovery for Discord verifier
        """
        return {
            'action': 'restart',
            'message': 'Restarting Discord bot due to persistent connection issues',
            'commands': [
                'pkill -f discord_verifier.py',
                f"python3 {PROJECT_ROOT / 'discord_verifier.py'}"
            ]
        }

    def _content_processor_recovery(self):
        """
        Specific recovery for content processor
        """
        return {
            'action': 'reset_state',
            'message': 'Resetting content processor state due to processing errors',
            'commands': [
                f"cp {PROJECT_ROOT / 'config/state.json.backup'} {get_state_path()}"
            ]
        }

    def _default_recovery(self):
        """
        Generic recovery for unrecognized components
        """
        return {
            'action': 'log_and_continue',
            'message': 'Unrecognized component error, continuing with monitoring'
        }

def main():
    # Example usage
    error_handler = StantonTimesErrorHandler(
        str(get_config_path()),
        get_log_path('error_log.json')
    )
    
    try:
        # Simulate an error
        raise ValueError("Example error for testing")
    except Exception as e:
        recovery_action = error_handler.handle_error('bird_monitor', e)
        print(json.dumps(recovery_action, indent=2))

if __name__ == "__main__":
    main()