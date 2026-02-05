import smtplib
import logging
from email.mime.text import MIMEText
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

class NotificationService:
    def __init__(self, config):
        """
        Initialize notification services
        
        :param config: Dictionary containing notification configurations
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Email configuration
        if config.get('email'):
            self.email_config = config['email']
        
        # Slack configuration
        if config.get('slack'):
            self.slack_client = WebClient(token=config['slack']['token'])
            self.slack_channel = config['slack'].get('channel', '#alerts')
    
    def send_email_alert(self, subject: str, message: str):
        """
        Send email alert
        
        :param subject: Alert subject
        :param message: Alert message body
        """
        try:
            msg = MIMEText(message)
            msg['Subject'] = subject
            msg['From'] = self.email_config['sender']
            msg['To'] = self.email_config['recipients']
            
            with smtplib.SMTP(self.email_config['smtp_server'], 
                               self.email_config.get('smtp_port', 587)) as server:
                server.starttls()
                server.login(self.email_config['username'], 
                             self.email_config['password'])
                server.sendmail(msg['From'], msg['To'], msg.as_string())
            
            self.logger.info(f"Email alert sent: {subject}")
        except Exception as e:
            self.logger.error(f"Failed to send email alert: {e}")
    
    def send_slack_alert(self, message: str):
        """
        Send Slack alert
        
        :param message: Alert message
        """
        try:
            response = self.slack_client.chat_postMessage(
                channel=self.slack_channel,
                text=message
            )
            self.logger.info(f"Slack alert sent: {message}")
        except SlackApiError as e:
            self.logger.error(f"Failed to send Slack alert: {e}")
    
    def send_alert(self, alert_messages: list):
        """
        Send alerts through configured channels
        
        :param alert_messages: List of alert messages
        """
        if not alert_messages:
            return
        
        # Combine alerts into a single message
        full_message = "\n".join(alert_messages)
        
        # Send via configured channels
        if self.config.get('email'):
            self.send_email_alert(
                subject="Queue Monitoring Alerts",
                message=full_message
            )
        
        if self.config.get('slack'):
            self.send_slack_alert(full_message)

# Example notification configuration
NOTIFICATION_CONFIG = {
    'email': {
        'smtp_server': 'smtp.gmail.com',
        'smtp_port': 587,
        'username': 'your_email@gmail.com',
        'password': 'your_app_password',
        'sender': 'your_email@gmail.com',
        'recipients': ['admin1@example.com', 'admin2@example.com']
    },
    'slack': {
        'token': 'xoxp-your-slack-token',
        'channel': '#queue-alerts'
    }
}

# Usage example
if __name__ == '__main__':
    notification_service = NotificationService(NOTIFICATION_CONFIG)
    
    # Example alert messages
    alerts = [
        "ALERT: Order queue size exceeded 500",
        "ALERT: Payment queue processing time too high"
    ]
    
    notification_service.send_alert(alerts)