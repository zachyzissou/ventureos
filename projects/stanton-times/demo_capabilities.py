import json
import sys
from src.content_processor import StantonTimesContentProcessor
from ml_scorer import AdvancedContentScorer
from error_handler import StantonTimesErrorHandler
from permission_manager import StantonTimesPermissionManager
from system_monitor import StantonTimesSystemMonitor
from src.config import get_config_path, get_log_path

def demonstrate_ml_scoring():
    """
    Demonstrate Machine Learning Content Scoring
    """
    print("\n🔍 Machine Learning Content Scoring Demo:")
    scorer = AdvancedContentScorer()
    
    test_texts = [
        "Server meshing breakthrough in Star Citizen Alpha 4.6",
        "New ship revealed at Invictus Launch Week",
        "Minor bug fix released",
        "Comprehensive narrative event expanding Levski's storyline"
    ]
    
    for text in test_texts:
        score = scorer.score_content(text)
        print(f"Text: {text}")
        print(f"ML Score: {score:.2f}\n")

def demonstrate_content_processing():
    """
    Showcase advanced content processing
    """
    print("\n🚀 Content Processing Demonstration:")
    processor = StantonTimesContentProcessor()
    
    test_contents = [
        {
            "source": "RobertsSpaceInd",
            "topic": "Levski Lifeline Event",
            "description": "Comprehensive narrative event expanding Levski's storyline with community-driven medical research mission",
            "id": "test_levski_event"
        },
        {
            "source": "starcitizenbot",
            "topic": "Minor Patch Update",
            "description": "Small bug fixes and performance improvements",
            "id": "test_minor_patch"
        }
    ]
    
    for content in test_contents:
        # Demonstrate processing with different user permissions
        print("\nProcessing Content:")
        print(f"Topic: {content['topic']}")
        print(f"Source: {content['source']}")
        
        # Admin user
        admin_result = processor.process_content(content, user_id='956203522624462918')
        print("\nAdmin User Processing:")
        print(json.dumps(admin_result, indent=2))
        
        # Unauthorized user
        unauth_result = processor.process_content(content, user_id='unauthorized_user')
        print("\nUnauthorized User Processing:")
        print(json.dumps(unauth_result, indent=2))

def demonstrate_error_handling():
    """
    Show advanced error handling capabilities
    """
    print("\n⚠️ Error Handling Demonstration:")
    error_handler = StantonTimesErrorHandler(
        str(get_config_path()),
        get_log_path('demo_errors.log')
    )
    
    # Simulate different error scenarios
    try:
        # Intentional error
        raise ValueError("Demonstration error")
    except Exception as e:
        recovery_action = error_handler.handle_error('demo_component', e)
        print("Error Recovery Action:")
        print(json.dumps(recovery_action, indent=2))

def demonstrate_permission_management():
    """
    Show permission management capabilities
    """
    print("\n🔐 Permission Management Demonstration:")
    permission_manager = StantonTimesPermissionManager(
        str(get_config_path())
    )
    
    test_users = [
        '956203522624462918',  # Admin
        'new_contributor',     # New user
        'reader_user'          # Reader
    ]
    
    actions = ['approve', 'submit_draft', 'edit_config']
    
    for user_id in test_users:
        print(f"\nUser: {user_id}")
        print("Roles:", permission_manager.get_user_roles(user_id))
        
        print("Permissions:")
        for action in actions:
            has_permission = permission_manager.check_permission(user_id, action)
            print(f"  {action}: {'✅ Allowed' if has_permission else '❌ Denied'}")

def demonstrate_system_monitoring():
    """
    Show system monitoring capabilities
    """
    print("\n💻 System Monitoring Demonstration:")
    system_monitor = StantonTimesSystemMonitor(
        str(get_config_path())
    )
    
    # Generate health report
    health_report = system_monitor.generate_health_report()
    print("System Health Report:")
    print(json.dumps(health_report, indent=2))
    
    # Check recovery actions
    recovery_actions = system_monitor.auto_recover(health_report)
    print("\nAuto-Recovery Actions:")
    print(recovery_actions)

def main():
    print("🌟 Stanton Times Advanced Capabilities Demonstration 🌟")
    
    # Uncomment/comment demonstrations as needed
    demonstrate_ml_scoring()
    demonstrate_content_processing()
    demonstrate_error_handling()
    demonstrate_permission_management()
    demonstrate_system_monitoring()

if __name__ == "__main__":
    main()
