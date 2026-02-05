package com.distributedqueue.persistence;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

public class WriteAheadLogManager {
    private static final String WAL_DIRECTORY = "/var/log/distributed-queue/wal/";
    private static final String CHECKPOINT_DIRECTORY = "/var/log/distributed-queue/checkpoints/";

    public void writeMessageToLog(Message message) {
        try {
            String logFileName = generateLogFileName(message);
            Path logFilePath = Paths.get(WAL_DIRECTORY + logFileName);
            
            // Ensure directory exists
            Files.createDirectories(logFilePath.getParent());
            
            try (PrintWriter writer = new PrintWriter(new FileWriter(logFilePath.toFile(), true))) {
                writer.println(serializeMessage(message));
            }
        } catch (IOException e) {
            // Handle logging failure - potentially use a backup logging mechanism
            System.err.println("Failed to write message to WAL: " + e.getMessage());
        }
    }

    public void createCheckpoint(List<Message> processedMessages) {
        try {
            String checkpointFileName = "checkpoint_" + Instant.now().toEpochMilli() + ".log";
            Path checkpointPath = Paths.get(CHECKPOINT_DIRECTORY + checkpointFileName);
            
            // Ensure directory exists
            Files.createDirectories(checkpointPath.getParent());
            
            try (PrintWriter writer = new PrintWriter(new FileWriter(checkpointPath.toFile()))) {
                for (Message message : processedMessages) {
                    writer.println(serializeMessage(message));
                }
            }
        } catch (IOException e) {
            System.err.println("Failed to create checkpoint: " + e.getMessage());
        }
    }

    public List<Message> recoverFromCheckpoint() throws IOException {
        return Files.list(Paths.get(CHECKPOINT_DIRECTORY))
            .sorted((p1, p2) -> {
                try {
                    return Files.getLastModifiedTime(p2).compareTo(Files.getLastModifiedTime(p1));
                } catch (IOException e) {
                    return 0;
                }
            })
            .findFirst()
            .map(this::readMessagesFromCheckpoint)
            .orElse(List.of());
    }

    private List<Message> readMessagesFromCheckpoint(Path checkpointFile) {
        try {
            return Files.readAllLines(checkpointFile).stream()
                .map(this::deserializeMessage)
                .collect(Collectors.toList());
        } catch (IOException e) {
            System.err.println("Failed to read checkpoint: " + e.getMessage());
            return List.of();
        }
    }

    private String serializeMessage(Message message) {
        // Simple serialization format: messageId|queueName|payload|timestamp|status
        return String.format("%s|%s|%s|%s|%s", 
            message.getMessageId(), 
            message.getQueueName(), 
            new String(message.getPayload()), 
            message.getTimestamp(), 
            message.getStatus());
    }

    private Message deserializeMessage(String serializedMessage) {
        String[] parts = serializedMessage.split("\\|");
        // Implement deserialization logic
        // This is a simplified version and might need more robust parsing
        Message message = new Message(parts[1], parts[2].getBytes());
        // Set additional properties if needed
        return message;
    }

    private String generateLogFileName(Message message) {
        return String.format("%s_%s.log", 
            message.getQueueName(), 
            Instant.now().toEpochMilli());
    }
}