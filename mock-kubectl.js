// Mock kubectl handler for testing without a real K8s cluster
// Intercepts kubectl commands and returns realistic mock responses

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
    return 'Kubernetes control plane is running at https://mock-cluster:6443\n';
  }

  if (kubectlCmd.match(/^version/)) {
    return 'Client Version: version.Info{Major:"1", Minor:"28", GitVersion:"v1.28.0"}\nServer Version: version.Info{Major:"1", Minor:"28", GitVersion:"v1.28.0"}\n';
  }

  if (kubectlCmd.match(/^run\s+/)) {
    const match = kubectlCmd.match(/run\s+(\S+)/);
    const podName = match ? match[1] : 'unknown';
    return `pod/${podName} created\n`;
  }

  if (kubectlCmd.match(/^delete\s+pod/)) {
    return 'pod deleted\n';
  }

  if (kubectlCmd.match(/^describe\s+pod/)) {
    return `Name:       nginx\nNamespace:  default\nStatus:     Running\nReady:      True\n... (mock describe output)\n`;
  }

  if (kubectlCmd.match(/^logs\s+/)) {
    return '[mock] Pod logs would appear here\n';
  }

  if (kubectlCmd.match(/^help/)) {
    return 'kubectl controls the Kubernetes cluster manager.\n\nBasic Commands:\n  get         Display one or many resources\n  describe    Show details of a specific resource\n  create       Create a resource from a file or stdin\n...\n';
  }

  // Default: command not mocked
  return `[Mock Mode] Command '${kubectlCmd}' not mocked yet.\nTry: kubectl get pods, kubectl get nodes, kubectl version\n`;
}

function mockGetPods(cmd) {
  const output = `NAME                       READY   STATUS    RESTARTS   AGE
nginx                      1/1     Running   0          5m
mock-pod-1                 1/1     Running   0          3m
mock-pod-2                 1/1     Pending   0          1m
`;
  return output;
}

function mockGetNodes() {
  return `NAME                     STATUS   ROLES    AGE   VERSION
mock-node-1              Ready    <none>   10m   v1.28.0
mock-node-2              Ready    <none>   10m   v1.28.0
`;
}

function mockGetNamespaces() {
  return `NAME              STATUS   AGE
default           Active   20m
kube-system       Active   20m
kube-public       Active   20m
sandbox-mock      Active   5m
`;
}

function mockGetServices() {
  return `NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP   20m
nginx        ClusterIP   10.96.1.2      <none>        80/TCP    5m
`;
}

function mockGetDeployments() {
  return `NAME   READY   UP-TO-DATE   AVAILABLE   AGE
nginx   1/1     1            1           5m
`;
}

module.exports = {
  handleKubectlCommand,
  mockGetPods,
  mockGetNodes,
  mockGetNamespaces
};
