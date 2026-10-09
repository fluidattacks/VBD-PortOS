import { getListeningPorts, findAvailablePorts } from '../lib/platform.js';
import { getReservedPorts } from './apps.js';

// Default port range for new apps
const DEFAULT_PORT_RANGE_START = 6000;
const DEFAULT_PORT_RANGE_END = 6099;

/**
 * Scan system for used ports and compute available ranges
 */
export async function scanPorts() {
  // Get ports currently in use by the system
  const usedPorts = await getListeningPorts();

  // Get ports reserved by registered apps (may not be currently running)
  const reservedPorts = await getReservedPorts();

  // Combine used and reserved
  const allOccupied = [...new Set([...usedPorts, ...reservedPorts])].sort((a, b) => a - b);

  // Compute free ranges in our default range
  const freeRanges = computeFreeRanges(allOccupied, DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END);

  // Find suggested next available ports
  const suggestedPorts = await findAvailablePorts(DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END, 2);

  return {
    usedPorts,
    reservedPorts,
    allOccupied,
    freeRanges,
    suggestedPorts,
    defaultRange: {
      start: DEFAULT_PORT_RANGE_START,
      end: DEFAULT_PORT_RANGE_END
    }
  };
}

/**
 * Compute free ranges within a given range
 */
function computeFreeRanges(occupiedPorts, start, end) {
  const ranges = [];
  let rangeStart = start;

  const portsInRange = occupiedPorts.filter(p => p >= start && p <= end).sort((a, b) => a - b);

  for (const port of portsInRange) {
    if (rangeStart < port) {
      ranges.push({ start: rangeStart, end: port - 1, count: port - rangeStart });
    }
    rangeStart = port + 1;
  }

  // Add remaining range after last occupied port
  if (rangeStart <= end) {
    ranges.push({ start: rangeStart, end, count: end - rangeStart + 1 });
  }

  return ranges;
}

/**
 * Check if specific ports are available
 */
export async function checkPortsAvailable(ports) {
  const scan = await scanPorts();
  const results = {};

  for (const port of ports) {
    results[port] = !scan.allOccupied.includes(port);
  }

  return results;
}

/**
 * Allocate N ports from the available range
 */
export async function allocatePorts(count = 1) {
  const scan = await scanPorts();

  if (scan.suggestedPorts.length < count) {
    const needed = count - scan.suggestedPorts.length;
    const additional = await findAvailablePorts(
      DEFAULT_PORT_RANGE_START,
      DEFAULT_PORT_RANGE_END + 100,
      needed
    );
    return [...scan.suggestedPorts, ...additional].slice(0, count);
  }

  return scan.suggestedPorts.slice(0, count);
}
