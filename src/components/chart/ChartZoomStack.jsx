import { Glass, Icon } from '../../ui/primitives'

export function ChartZoomStack({ onZoomIn, onZoomOut }) {
  return (
    <Glass radius={14} pad={4} style={{ display: 'flex', flexDirection: 'column' }}>
      <button onClick={onZoomIn} style={{
        width: 76, height: 76, borderRadius: 12, border: 0, background: 'transparent',
        color: 'var(--fg1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}><Icon name="plus" size={36}/></button>
      <div style={{ height: 0.5, background: 'var(--bg-hairline)', margin: '0 12px' }}/>
      <button onClick={onZoomOut} style={{
        width: 76, height: 76, borderRadius: 12, border: 0, background: 'transparent',
        color: 'var(--fg1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}><Icon name="minus" size={36}/></button>
    </Glass>
  )
}
