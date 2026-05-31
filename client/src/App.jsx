import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import TasksPage from './pages/TasksPage';
import './index.css';

function Nav() {
  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
        <span className="font-bold text-gray-900 ml-4">📚 Final Project</span>
        <NavLink to="/" className={linkClass} end>משימות</NavLink>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<TasksPage />} />
      </Routes>
    </BrowserRouter>
  );
}
