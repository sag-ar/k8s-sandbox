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

// Helper: pad string to exact width with spaces
function pad(str, width) {
  str = String(str);
  if (str.length >= width) return str.substring(0, width);
  return str + ' '.repeat(width - str.length);
}

function mockGetPods(cmd) {
  // Column widths: NAME=30, READY=8, STATUS=10, RESTARTS=10, AGE=6
  let output = '';
  output += pad('NAME', 30) + pad('READY', 8) + pad('STATUS', 10) + pad('RESTARTS', 10) + 'AGE\r\n';
  output += pad('nginx', 30) + pad('1/1', 8) + pad('Running', 10) + pad('0', 10) + '5m\r\n';
  output += pad('mock-pod-1', 30) + pad('1/1', 8) + pad('Running', 10) + pad('0', 10) + '3m\r\n';
  output += pad('mock-pod-2', 30) + pad('1/1', 8) + pad('Pending', 10) + pad('0', 10) + '1m\r\n';
  return output;
}

function mockGetNodes() {
  // Column widths: NAME=25, STATUS=10, ROLES=12, AGE=8, VERSION=10
  let output = '';
  output += pad('NAME', 25) + pad('STATUS', 10) + pad('ROLES', 12) + pad('AGE', 8) + 'VERSION\r\n';
  output += pad('mock-node-1', 25) + pad('Ready', 10) + pad('<none>', 12) + pad('10m', 8) + 'v1.28.0\r\n';
  output += pad('mock-node-2', 25) + pad('Ready', 10) + pad('<none>', 12) + pad('10m', 8) + 'v1.28.0\r\n';
  return output;
}

function mockGetNamespaces() {
  // Column widths: NAME=25, STATUS=10, AGE=6
  let output = '';
  output += pad('NAME', 25) + pad('STATUS', 10) + 'AGE\r\n';
  output += pad('default', 25) + pad('Active', 10) + '20m\r\n';
  output += pad('kube-system', 25) + pad('Active', 10) + '20m\r\n';
  output += pad('kube-public', 25) + pad('Active', 10) + '20m\r\n';
  output += pad('sandbox-mock', 25) + pad('Active', 10) + '5m\r\n';
  return output;
}

function mockGetServices() {
  // Column widths: NAME=20, TYPE=12, CLUSTER-IP=15, EXTERNAL-IP=13, PORT(S)=10, AGE=6
  let output = '';
  output += pad('NAME', 20) + pad('TYPE', 12) + pad('CLUSTER-IP', 15) + pad('EXTERNAL-IP', 13) + pad('PORT(S)', 10) + 'AGE\r\n';
  output += pad('kubernetes', 20) + pad('ClusterIP', 12) + pad('10.96.0.1', 15) + pad('<none>', 13) + pad('443/TCP', 10) + '20m\r\n';
  output += pad('nginx', 20) + pad('ClusterIP', 12) + pad('10.96.1.2', 15) + pad('<none>', 13) + pad('80/TCP', 10) + '5m\r\n';
  return output;
}

function mockGetDeployments() {
  // Column widths: NAME=20, READY=8, UP-TO-DATE=12, AVAILABLE=12, AGE=6
  let output = '';
  output += pad('NAME', 20) + pad('READY', 8) + pad('UP-TO-DATE', 12) + pad('AVAILABLE', 12) + 'AGE\r\n';
  output += pad('nginx', 20) + pad('1/1', 8) + pad('1', 12) + pad('1', 12) + '5m\r\n';
  return output;
}

module.exports = {
  handleKubectlCommand,
  mockGetPods,
  mockGetNodes,
  mockGetNamespaces
};
