import { useState, useEffect, useCallback } from 'react';
import socket from '../../services/socket';
import AgentCard from '../cos/tabs/AgentCard';

const MAX_OUTPUT_LINES = 200;

export default function PeerAgentsSection({ peerId, peerName }) {
  const [agents, setAgents] = useState([]);
  const [liveOutputs, setLiveOutputs] = useState({});

  // Handle agents list update
  const handleAgentsUpdated = useCallback((data) => {
    if (data.peerId !== peerId) return;
    setAgents(data.agents || []);
  }, [peerId]);

  // Handle agent spawned
  const handleAgentSpawned = useCallback((data) => {
    if (data.peerId !== peerId) return;
    setAgents(prev => {
      if (prev.some(a => a.id === data.agent.id)) return prev;
      return [...prev, data.agent];
    });
  }, [peerId]);

  // Handle agent updated
  const handleAgentUpdated = useCallback((data) => {
    if (data.peerId !== peerId) return;
    setAgents(prev => prev.map(a => a.id === data.agent.id ? { ...a, ...data.agent } : a));
  }, [peerId]);

  // Handle agent output (streaming)
  const handleAgentOutput = useCallback((data) => {
    if (data.peerId !== peerId) return;
    const { agentId, line, timestamp } = data;
    setLiveOutputs(prev => {
      const existing = prev[agentId] || [];
      const updated = [...existing, { line, timestamp }];
      // Cap to prevent unbounded growth
      if (updated.length > MAX_OUTPUT_LINES) {
        return { ...prev, [agentId]: updated.slice(-MAX_OUTPUT_LINES) };
      }
      return { ...prev, [agentId]: updated };
    });
  }, [peerId]);

  // Handle agent completed
  const handleAgentCompleted = useCallback((data) => {
    if (data.peerId !== peerId) return;
    setAgents(prev => prev.filter(a => a.id !== data.agent.id));
    setLiveOutputs(prev => {
      const next = { ...prev };
      delete next[data.agent.id];
      return next;
    });
  }, [peerId]);

  useEffect(() => {
    socket.on('instances:peer:agents:updated', handleAgentsUpdated);
    socket.on('instances:peer:agent:spawned', handleAgentSpawned);
    socket.on('instances:peer:agent:updated', handleAgentUpdated);
    socket.on('instances:peer:agent:output', handleAgentOutput);
    socket.on('instances:peer:agent:completed', handleAgentCompleted);

    return () => {
      socket.off('instances:peer:agents:updated', handleAgentsUpdated);
      socket.off('instances:peer:agent:spawned', handleAgentSpawned);
      socket.off('instances:peer:agent:updated', handleAgentUpdated);
      socket.off('instances:peer:agent:output', handleAgentOutput);
      socket.off('instances:peer:agent:completed', handleAgentCompleted);
    };
  }, [handleAgentsUpdated, handleAgentSpawned, handleAgentUpdated, handleAgentOutput, handleAgentCompleted]);

  if (agents.length === 0) return null;

  return (
    <div className="mt-3 border-t border-port-border pt-3">
      <div className="text-xs text-gray-500 mb-2">Active Agents ({agents.length})</div>
      <div className="space-y-2">
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            completed={false}
            liveOutput={liveOutputs[agent.id] || []}
            remote
            peerName={peerName}
          />
        ))}
      </div>
    </div>
  );
}
