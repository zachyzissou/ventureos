package com.distributedqueue.persistence;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

public class Message implements Serializable {
    private final UUID messageId;
    private final String queueName;
    private final byte[] payload;
    private final Instant timestamp;
    private MessageStatus status;

    public enum MessageStatus {
        PENDING,
        PROCESSED,
        FAILED
    }

    public Message(String queueName, byte[] payload) {
        this.messageId = UUID.randomUUID();
        this.queueName = queueName;
        this.payload = payload;
        this.timestamp = Instant.now();
        this.status = MessageStatus.PENDING;
    }

    // Getters and other necessary methods
    public UUID getMessageId() {
        return messageId;
    }

    public String getQueueName() {
        return queueName;
    }

    public byte[] getPayload() {
        return payload;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public MessageStatus getStatus() {
        return status;
    }

    public void setStatus(MessageStatus status) {
        this.status = status;
    }
}