import { useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { db } from './db/database'
import Dashboard from './pages/Dashboard'
import CattleList from './pages/CattleList'
import CattleDetail from './pages/CattleDetail'
import EventForm from './pages/EventForm'
import Settings from './pages/Settings'

async function applyDataFixes() {
  // 1264, 1268: 繁殖除外 → 成牛市場出荷に変更
  const fixes = [
    { earTags: ['1264(81.0)', '1264'], dest: '成牛市場', date: '2024-06-27' },
    { earTags: ['1268(80.5)', '1268'], dest: '成牛市場', date: '2024-05-19' },
  ];
  for (const fix of fixes) {
    for (const tag of fix.earTags) {
      const cattle = await db.cattle.where('earTag').equals(tag).first();
      if (!cattle) continue;
      const existing = await db.shipment.where('cattleId').equals(cattle.id).first();
      if (!existing) {
        await db.shipment.add({
          cattleId: cattle.id, date: fix.date, destination: fix.dest,
          weight: '', cost: '', memo: '', worker: '',
        });
      }
      break;
    }
  }
}

function App() {
  const location = useLocation()

  useEffect(() => { applyDataFixes(); }, [])
  const isDetail = location.pathname.startsWith('/cattle/')
  const isForm = location.pathname.startsWith('/event')

  return (
    <>
      {!isDetail && !isForm && (
        <header className="app-header">
          <div className="app-header-row">
            <h1>繁殖管理</h1>
          </div>
        </header>
      )}

      <main className="main-content container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cattle" element={<CattleList />} />
          <Route path="/cattle/:id" element={<CattleDetail />} />
          <Route path="/event/:type" element={<EventForm />} />
          <Route path="/event/:type/:cattleId" element={<EventForm />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {!isForm && (
        <nav className="bottom-nav">
          <NavLink to="/" end>
            <span className="nav-icon">&#x1F3E0;</span>
            ホーム
          </NavLink>
          <NavLink to="/cattle">
            <span className="nav-icon">&#x1F404;</span>
            牛一覧
          </NavLink>
          <NavLink to="/event/breeding">
            <span className="nav-icon">&#x2795;</span>
            記録
          </NavLink>
          <NavLink to="/settings">
            <span className="nav-icon">&#x2699;</span>
            設定
          </NavLink>
        </nav>
      )}
    </>
  )
}

export default App
