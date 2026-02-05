import requests

def test_discord_token(token):
    headers = {
        'Authorization': f'Bot {token}',
        'Content-Type': 'application/json'
    }
    
    response = requests.get('https://discord.com/api/v10/users/@me', headers=headers)
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

with open('/Users/zachgonser/.credentials/stanton_times_discord_token', 'r') as f:
    token = f.read().strip()

test_discord_token(token)