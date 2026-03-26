import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { MapTextDemo } from './pages/MapTextDemo';
import { MapPage } from './pages/MapPage';
import './App.css';

function App() {
  return (
    <HashRouter>
      <div className="layout-root">
        <nav className="global-nav">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/map" className="nav-link">Kyushu Map</Link>
        </nav>
        <Routes>
          <Route path="/" element={<MapTextDemo />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
