// Mock kubectl handler for testing without a real K8s cluster
// Intercepts kubectl commands and returns realistic mock responses.

function handleKubectlCommand(command) {
  const cmd = command.trim();

  // Remove 'kubectl ' prefix
  const kubectlCmd = cmd.startsWith('kubectl ') ? cmd.slice(8).trim() : cmd;

  // Parse the command
  if (kubectlCmd.match(/^get\s+pods?/)) {
    return mockGetPods(kubectlCmd);
  }

  if (kubectlCmd.match(/^get\s+nodes?/)) {
    return mockGetNodes();
  }

  if (kubectlCmd.match(/^get\s+namespaces?/)) {
    return mockGetNamespaces();
  }

  if (kubectlCmd.match(/^get\s+services?/)) {
    return mockGetServices();
  }

  if (kubectlCmd.match(/^get\s+deployments?/)) {
    return mockGetDeployments();
  }

  if (kubectlCmd.match(/^cluster-info/)) {
    return 'Kubernetes control plane is running at https://mock-cluster:6443\r\n';
  }

  if (kubectlCmd.match(/^version/)) {
    return 'Client Version: v1.28.0\r\nServer Version: v1.28.0\r\n';
  }

  if (kubectlCmd.match(/^run\s+/)) {
    const match = kubectlCmd.match(/run\s+(\S+)/);
    const podName = match ? match[1] : 'unknown';
    return `pod/${podName} created\r\n`;
  }

  if (kubectlCmd.match(/^delete\s+pod/)) {
    return 'pod deleted\r\n';
  }

  if (kubectlCmd.match(/^describe\s+pod/)) {
    return 'Name:\tnginx\r\nNamespace:\tdefault\r\nStatus:\tRunning\r\nReady:\tTrue\r\nContainers:\r\n  nginx:\r\n    Image:\tnginx:latest\r\n    Port:\t80/TCP\r\n    Ready:\tTrue\r\n';
  }

  if (kubectlCmd.match(/^logs\s+/)) {
    return '[mock] Pod logs would appear here\r\nLine 2 of logs...\r\nLine 3 of logs...\r\n';
  }

  if (kubectlCmd.match(/^help/)) {
    return 'kubectl controls the Kubernetes cluster manager.\r\n\r\nBasic Commands:\r\n  get         Display one or many resources\r\n  describe    Show details of a specific resource\r\n  create      Create a resource from a file or stdin\r\n';
  }

  // Default: command not mocked
  return `[Mock Mode] Command '${kubectlCmd}' not mocked yet.\r\nTry: kubectl get pods, kubectl get nodes, kubectl version\r\n`;
}

function padRight(str, width) {
  str = String(str);
  if (str.length >= width) return str;
  return str + ' '.repeat(width - str.length);
}

function mockGetPods(cmd) {
  let output = '';
  output += padRight('NAME', 30) + padRight('READY', 8) + padRight('STATUS', 10) + padRight('RESTARTS', 10) + 'AGE\r\n';
  output += padRight('nginx', 30) + padRight('1/1', 8) + padRight('Running', 10) + padRight('0', 10) + '5m\r\n';
  output += padRight('mock-pod-1', 30) + padRight('1/1', 8) + padRight('Running', 10) + padRight('0', 10) + '3m\r\n';
  output += padRight('mock-pod-2', 30) + padRight('1/1', 8) + padRight('Pending', 10) + padRight('0', 10) + '1m\r\n';
  return output;
}

function mockGetNodes() {
  let output = '';
  output += padRight('NAME', 25) + padRight('STATUS', 10) + padRight('ROLES', 12) + padRight('AGE', 8) + 'VERSION\r\n';
  output += padRight('mock-node-1', 25) + padRight('Ready', 10) + padRight('<none>', 12) + padRight('10m', 8) + 'v1.28.0\r\n';
  output += padRight('mock-node-2', 25) + padRight('Ready', 10) + padRight('<none>', 12) + padRight('10m', 8) + 'v1.28.0\r\n';
  return output;
}

function mockGetNamespaces() {
  let output = '';
  output += padRight('NAME', 25) + padRight('STATUS', 10) + 'AGE\r\n';
  output += padRight('default', 25) + padRight('Active', 10) + '20m\r\n';
  output += padRight('kube-system', 25) + padRight('Active', 10) + '20m\r\n';
  output += padRight('kube-public', 25) + padRight('Active', 10) + '20m\r\n';
  output += padRight('sandbox-mock', 25) + padRight('Active', 10) + '5m\r\n';
  return output;
}

function mockGetServices() {
  let output = '';
  output += padRight('NAME', 20) + padRight('TYPE', 12) + padRight('CLUSTER-IP', 15) + padRight('EXTERNAL-IP', 13) + padRight('PORT(S)', 10) + 'AGE\r\n';
  output += padRight('kubernetes', 20) + padRight('ClusterIP', 12) + padRight('10.96.0.1', 15) + padRight('<none>', 13) + padRight('443/TCP', 10) + '20m\r\n';
  output += padRight('nginx', 20) + padRight('ClusterIP', 12) + padRight('10.96.1.2', 15) + padRight('<none>', 13) + padRight('80/TCP', 10) + '5m\r\n';
  return output;
}

function mockGetDeployments() {
  let output = '';
  output += padRight('NAME', 20) + padRight('READY', 8) + padRight('UP-TO-DATE', 12) + padRight('AVAILABLE', 12) + 'AGE\r\n';
  output += padRight('nginx', 20) + padRight('1/1', 8) + padRight('1', 12) + padRight('1', 12) + '5m\r\n';
  return output;
}

module.exports = {
  handleKubectlCommand,
  mockGetPods,
  mockGetNodes,
  mockGetNamespaces
};
