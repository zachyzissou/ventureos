package com.distributedqueue.persistence;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.PreparedStatement;
import com.datastax.oss.driver.api.core.cql.ResultSet;
import com.datastax.oss.driver.api.core.cql.Row;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class PersistenceManager {
    private final CqlSession session;
    private final PreparedStatement insertMessageStatement;
    private final PreparedStatement updateMessageStatusStatement;
    private final PreparedStatement selectMessagesStatement;

    public PersistenceManager(List<String> contactPoints, int port, String keyspace) {
        // Create Cassandra session
        this.session = CqlSession.builder()
            .addContactPoints(contactPoints.stream()
                .map(cp -> new InetSocketAddress(cp, port))
                .toArray(InetSocketAddress[]::new))
            .withKeyspace(keyspace)
            .build();

        // Prepare statements for efficient database operations
        insertMessageStatement = session.prepare(
            "INSERT INTO messages (message_id, queue_name, payload, timestamp, status) " +
            "VALUES (?, ?, ?, ?, ?)");

        updateMessageStatusStatement = session.prepare(
            "UPDATE messages SET status = ? WHERE message_id = ?");

        selectMessagesStatement = session.prepare(
            "SELECT * FROM messages WHERE queue_name = ? AND status = ?");
    }

    public void persistMessage(Message message) {
        session.execute(insertMessageStatement.bind(
            message.getMessageId(),
            message.getQueueName(),
            message.getPayload(),
            message.getTimestamp(),
            message.getStatus().name()
        ));
    }

    public void updateMessageStatus(UUID messageId, Message.MessageStatus status) {
        session.execute(updateMessageStatusStatement.bind(
            status.name(),
            messageId
        ));
    }

    public List<Message> getPendingMessages(String queueName) {
        ResultSet resultSet = session.execute(selectMessagesStatement.bind(
            queueName, 
            Message.MessageStatus.PENDING.name()
        ));

        List<Message> pendingMessages = new ArrayList<>();
        for (Row row : resultSet) {
            Message message = new Message(
                row.getString("queue_name"),
                row.getByteBuffer("payload").array()
            );
            message.setStatus(Message.MessageStatus.valueOf(row.getString("status")));
            pendingMessages.add(message);
        }

        return pendingMessages;
    }

    public void close() {
        session.close();
    }
}