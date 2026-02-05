#!/bin/bash

echo "Network Diagnostic Report"
echo "======================="

# Check network interfaces
echo -e "\n1. Network Interfaces:"
/sbin/ifconfig | grep inet

# Check routing table
echo -e "\n2. Routing Table:"
netstat -nr

# Check DNS configuration
echo -e "\n3. DNS Configuration:"
cat /etc/resolv.conf

# Check specific node connectivity
echo -e "\n4. GamingPC Connectivity:"
nc -z -w5 192.168.225.112 22  # SSH port
if [ $? -eq 0 ]; then
    echo "GamingPC is reachable"
else
    echo "GamingPC is not reachable"
fi

# Additional OpenClaw node check
echo -e "\n5. OpenClaw Node Status:"
openclaw nodes status

# Timestamp
echo -e "\nReport generated: $(date)"