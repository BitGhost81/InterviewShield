package com.interviewshield.backend.dto;

public class CreateLogRequest {
    private String sessionCode;
    private Long candidateId;
    private String eventType;  // TAB_SWITCH or WEBCAM_SNAPSHOT
    private String eventData;  // timestamp for tab switch, base64 for snapshot

    public String getSessionCode() { return sessionCode; }
    public void setSessionCode(String sessionCode) { this.sessionCode = sessionCode; }

    public Long getCandidateId() { return candidateId; }
    public void setCandidateId(Long candidateId) { this.candidateId = candidateId; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public String getEventData() { return eventData; }
    public void setEventData(String eventData) { this.eventData = eventData; }
}