// Command filtering for free tier users
// Free users can only run safe kubectl commands
// Pro users have full access

const FREE_TIER_WHITELIST = [
  // Read-only commands
  'get',
  'describe',
  'version',
  'cluster-info',
  'config view',
  'api-resources',
  'api-versions',
  'explain',
  'auth can-i',
  // Safe operations
  'run',
  'expose',
  'scale',
  'autoscale',
  'rollout status',
  'rollout history',
  // Basic debugging (read-only)
  'logs',
  'top',
];

const DANGEROUS_PATTERNS = [
  // Delete commands (unless specifically allowed with restrictions)
  /delete\s+(namespace|clusterrole|clusterrolebinding)/,
  /delete\s+.*--all/,
  // RBAC modifications
  /create\s+.*(role|rolebinding|clusterrole|clusterrolebinding)/,
  /apply\s+.*(role|rolebinding|clusterrole|clusterrolebinding)/,
  // Cluster-wide operations
  /taint\s+node/,
  /cordon\s+node/,
  /drain\s+node/,
  // Dangerous operations
  /exec\s+.*--rm/,
  /delete\s+.*--force\s+--grace-period=0/,
];

function parseKubectlCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('kubectl ')) {
    return { isKubectl: false, command: null };
  }

  const parts = trimmed.slice(8).trim().split(/\s+/);
  const subcommand = parts[0];
  const fullCommand = parts.slice(0, 2).join(' ');

  return {
    isKubectl: true,
    subcommand,
    fullCommand,
    args: parts.slice(1),
    raw: trimmed
  };
}

function isAllowedForFreeTier(parsed) {
  if (!parsed.isKubectl) {
    return { allowed: true }; // Non-kubectl commands pass through
  }

  // Check against dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(parsed.raw)) {
      return {
        allowed: false,
        reason: 'This command is restricted in free tier. Upgrade to Pro for full access.'
      };
    }
  }

  // Check if subcommand is in whitelist
  const isWhitelisted = FREE_TIER_WHITELIST.some(cmd => {
    if (cmd.includes(' ')) {
      return parsed.fullCommand.startsWith(cmd);
    }
    return parsed.subcommand === cmd;
  });

  if (!isWhitelisted) {
    return {
      allowed: false,
      reason: `Command '${parsed.subcommand}' is restricted in free tier. Upgrade to Pro for full access.`
    };
  }

  return { allowed: true };
}

function filterCommand(input, isPro = false) {
  if (isPro) {
    return { allowed: true, filtered: input };
  }

  const parsed = parseKubectlCommand(input);
  const check = isAllowedForFreeTier(parsed);

  if (!check.allowed) {
    return {
      allowed: false,
      reason: check.reason,
      filtered: null
    };
  }

  return { allowed: true, filtered: input };
}

module.exports = {
  parseKubectlCommand,
  isAllowedForFreeTier,
  filterCommand,
  FREE_TIER_WHITELIST,
  DANGEROUS_PATTERNS
};
