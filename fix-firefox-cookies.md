# Verify Firefox Cookie Path
# Ensure bird-auth.sh uses correct Firefox profile
# Check:
#   1. File exists at /Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite
#   2. Firefox profile matches (Preferences > Privacy > Use custom settings)
#   3. Cookies are valid (logout/login via Twitter)

# Fix:
# 1. Re-authenticate:
/Users/zachgonser/clawd/scripts/bird-auth.sh login
# 2. Verify path:
ls -l /Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite
# 3. Check permissions:
octal 644