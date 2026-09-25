import { useCallback, useMemo, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type Node,
  type EdgeChange, type NodeChange,
} from '@xyflow/react';
import { ImagePlus, Play, Boxes, Trash2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { CANVAS_NODE_LABELS, CANVAS_NODE_TYPES, IMAGE_ASPECT_RATIOS, isCanvasGenerationNode, type CanvasNodeType } from '../../domain/canvas';
import { validateCanvasConnection } from '../../domain/canvasConnections';

type CanvasProps = { projectId: string };
type NodeData = { label: string; type: CanvasNodeType; aspectRatio: string; status: string };
const initialNodes: Node<NodeData>[] = [
  { id: 'source', type: 'default', position: { x: 60, y: 170 }, data: { label: '雨夜街道参考', type: CANVAS_NODE_TYPES.upload, aspectRatio: '16:9', status: 'ready' }, style: { width: 210, background: 'var(--canvas-node-bg)', color: 'var(--ink-0)', border: '1px solid var(--canvas-node-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' } },
  { id: 'shot', type: 'default', position: { x: 380, y: 170 }, data: { label: '02 · 橱窗倒影', type: CANVAS_NODE_TYPES.imageEdit, aspectRatio: '16:9', status: 'running' }, style: { width: 210, background: 'var(--canvas-node-bg)', color: 'var(--ink-0)', border: '1px solid var(--brand-400)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' } },
  { id: 'output', type: 'default', position: { x: 700, y: 170 }, data: { label: '候选首帧', type: CANVAS_NODE_TYPES.exportImage, aspectRatio: '16:9', status: 'ready' }, style: { width: 210, background: 'var(--canvas-node-bg)', color: 'var(--ink-0)', border: '1px solid var(--canvas-node-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' } },
];
const initialEdges: Edge[] = [{ id: 'e-source-shot', source: 'source', target: 'shot', animated: true, style: { stroke: 'var(--canvas-edge)' } }, { id: 'e-shot-output', source: 'shot', target: 'output', animated: true, style: { stroke: 'var(--canvas-edge)' } }];

function CanvasInner({ projectId }: CanvasProps) {
  const [nodes, setNodes] = useState(initialNodes); const [edges, setEdges] = useState(initialEdges); const [selectedId, setSelectedId] = useState<string | null>('shot');
  const palette = useMemo(() => [CANVAS_NODE_TYPES.imageEdit, CANVAS_NODE_TYPES.aiVideo, CANVAS_NODE_TYPES.storyboardGen, CANVAS_NODE_TYPES.blueprint], []);
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(current => applyNodeChanges(changes, current) as Node<NodeData>[]), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges(current => applyEdgeChanges(changes, current)), []);
  const onConnect = useCallback((connection: Connection) => { if (!connection.source || !connection.target) return; const source = nodes.find(node => node.id === connection.source); const target = nodes.find(node => node.id === connection.target); const result = validateCanvasConnection(connection.source, connection.target, source?.data.type, target?.data.type, edges); if (!result.valid) return; setEdges(current => addEdge({ ...connection, animated: true, style: { stroke: 'var(--canvas-edge)' } }, current)); }, [edges, nodes]);
  const addNode = (type: CanvasNodeType) => { const id = `node-${Date.now()}`; const next = nodes.length; setNodes(current => [...current, { id, type: 'default', position: { x: 120 + (next % 3) * 280, y: 390 + Math.floor(next / 3) * 180 }, data: { label: CANVAS_NODE_LABELS[type], type, aspectRatio: IMAGE_ASPECT_RATIOS[1], status: isCanvasGenerationNode(type) ? 'queued' : 'ready' }, style: { width: 210, background: 'var(--canvas-node-bg)', color: 'var(--ink-0)', border: '1px solid var(--canvas-node-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' } }]); };
  const removeSelected = () => { if (!selectedId) return; setNodes(current => current.filter(node => node.id !== selectedId)); setEdges(current => current.filter(edge => edge.source !== selectedId && edge.target !== selectedId)); setSelectedId(null); };
  return <div className="canvas-real-shell"><div className="canvas-toolbar"><div><p className="eyebrow">画布 · {projectId}</p><h2>故事板画布</h2></div><div className="canvas-tools"><button onClick={() => addNode(CANVAS_NODE_TYPES.upload)}><ImagePlus size={13} /> 上传</button><button onClick={() => addNode(CANVAS_NODE_TYPES.imageEdit)}><Boxes size={13} /> 图像生成</button><button onClick={() => addNode(CANVAS_NODE_TYPES.aiVideo)}><Play size={13} /> 视频生成</button><button onClick={removeSelected}><Trash2 size={13} /> 删除选中</button></div></div><div className="canvas-real-stage"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedId(node.id)} fitView deleteKeyCode={['Backspace', 'Delete']} nodesConnectable nodesDraggable selectionOnDrag><Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-bg-dot)" /><Controls /><MiniMap nodeColor={node => node.id === selectedId ? 'var(--brand-300)' : 'var(--canvas-minimap-node)'} /></ReactFlow></div></div>;
}
export function Canvas({ projectId }: CanvasProps) { return <ReactFlowProvider><CanvasInner projectId={projectId} /></ReactFlowProvider>; }
