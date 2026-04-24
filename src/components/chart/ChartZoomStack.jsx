import { Glass, Icon } from '../../ui/primitives'

export function ChartZoomStack({ onZoomIn, onZoomOut }) {
  return (
    <Glass radius={10} pad={2} style={{ display: 'flex', flexDirection: 'column' }}>
      <button onClick={onZoomIn} style={{
        width: 40, height: 40, borderRadius: 8, border: 0, background: 'transparent',
        color: 'var(--fg1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}><Icon name="plus" size={18}/></button>
      <div style={{ height: 0.5, background: 'var(--bg-hairline)', margin: '0 8px' }}/>
      <button onClick={onZoomOut} style={{
        width: 40, height: 40, borderRadius: 8, border: 0, background: 'transparent',
        color: 'var(--fg1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}><Icon name="minus" size={18}/></button>
    </Glass>
  )
}
