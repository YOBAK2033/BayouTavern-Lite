import React, { createContext, useContext, useReducer, useEffect, useState, type Dispatch } from 'react';
import type { AppState, AppAction } from '../types';
import {
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_TPL_USER_WRAPPER,
  DEFAULT_TPL_IDENTITY_ANCHOR,
  DEFAULT_TPL_WORLD_BOOK_PREFIX,
  DEFAULT_TPL_MEMORY_PREFIX,
  DEFAULT_TPL_OPENING_LINE_PREFIX,
} from '../utils/constants';
import { setLowRateMode } from '../utils/apiFetch';
import * as Stores from '../db/stores';
import { safeGetLocalStorage, safeSetLocalStorage } from '../utils/safeStorage';

const initialState: AppState = {
  activeView: 'chat',
  currentConversationId: null,
  isMobile: false,
  sidebarOpen: true,
  theme: 'light',
  wallpaper: { image: '', overlayOpacity: 0.7, overlayMode: 'dark' },
  boldColorize: true,
  debugMode: false,
  lowRateMode: false,
  subAIConfig: {
    enabled: true,
    modelId: null,
    triggerInterval: 5,
    customSystemPrompt: '',
  },
  contextConfig: { ...DEFAULT_CONTEXT_CONFIG },
  tplUserWrapper: DEFAULT_TPL_USER_WRAPPER,
  tplIdentityAnchor: DEFAULT_TPL_IDENTITY_ANCHOR,
  tplWorldBookPrefix: DEFAULT_TPL_WORLD_BOOK_PREFIX,
  tplMemoryPrefix: DEFAULT_TPL_MEMORY_PREFIX,
  tplOpeningLinePrefix: DEFAULT_TPL_OPENING_LINE_PREFIX,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    case 'SET_CONVERSATION':
      return { ...state, currentConversationId: action.id, activeView: 'chat' };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'SET_MOBILE':
      return { ...state, isMobile: action.isMobile, sidebarOpen: action.isMobile ? false : true };
    case 'SET_THEME':
      return { ...state, theme: action.theme };
    case 'SET_WALLPAPER':
      return { ...state, wallpaper: { ...state.wallpaper, ...action.config } };
    case 'SET_BOLD_COLORIZE':
      return { ...state, boldColorize: action.enabled };
    case 'TOGGLE_DEBUG':
      return { ...state, debugMode: !state.debugMode };
    case 'SET_LOW_RATE_MODE':
      return { ...state, lowRateMode: action.enabled };
    case 'UPDATE_SUB_AI_CONFIG':
      return { ...state, subAIConfig: { ...state.subAIConfig, ...action.config } };
    case 'UPDATE_CONTEXT_CONFIG':
      return { ...state, contextConfig: { ...state.contextConfig, ...action.config } };
    case 'SET_ADV_TPL':
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType>(null!);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      dispatch({ type: 'SET_MOBILE', isMobile: e.matches });
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    Stores.getUISettings().then((settings) => {
      if (settings) {
        if (settings.theme) {
          // A pre-light-theme installation has no way to distinguish the old
          // default dark mode from an explicit user choice. Migrate only when
          // the user has not toggled the theme before.
          const hasExplicitThemePreference = safeGetLocalStorage('jg2_theme_preference_set') === '1';
          dispatch({ type: 'SET_THEME', theme: hasExplicitThemePreference ? settings.theme : 'light' });
        }
        if (settings.wallpaper) dispatch({ type: 'SET_WALLPAPER', config: settings.wallpaper });
        if (settings.boldColorize !== undefined) dispatch({ type: 'SET_BOLD_COLORIZE', enabled: settings.boldColorize });
        if (settings.debugMode !== undefined && settings.debugMode !== initialState.debugMode)
          dispatch({ type: 'TOGGLE_DEBUG' });
        if (settings.lowRateMode !== undefined && settings.lowRateMode !== initialState.lowRateMode)
          dispatch({ type: 'SET_LOW_RATE_MODE', enabled: settings.lowRateMode });
        if (settings.subAIConfig) {
          // Older builds stored `enabled: false` by default even though the
          // memory switch did not actually control the chat pipeline. Treat
          // that legacy value as the new default until the user explicitly
          // changes the switch in the input toolbar.
          const hasExplicitMemoryPreference = safeGetLocalStorage('jg2_memory_preference_set') === '1';
          const legacyPrompt = safeGetLocalStorage('jg2_subai_prompt') || '';
          dispatch({
            type: 'UPDATE_SUB_AI_CONFIG',
            config: {
              ...settings.subAIConfig,
              enabled: hasExplicitMemoryPreference ? settings.subAIConfig.enabled : true,
              customSystemPrompt: settings.subAIConfig.customSystemPrompt || legacyPrompt,
              triggerInterval: Math.min(10, Math.max(1, Number(settings.subAIConfig.triggerInterval) || 1)),
            },
          });
        }
        if (settings.contextConfig)
          dispatch({ type: 'UPDATE_CONTEXT_CONFIG', config: settings.contextConfig });
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [state.theme]);

  useEffect(() => {
    if (!settingsLoaded) return;
    Stores.setUISettings({
      theme: state.theme, wallpaper: state.wallpaper, boldColorize: state.boldColorize,
      debugMode: state.debugMode, lowRateMode: state.lowRateMode,
      subAIConfig: state.subAIConfig,
      contextConfig: state.contextConfig,
    });
  }, [state.theme, state.wallpaper, state.boldColorize, state.debugMode, state.lowRateMode,
    state.subAIConfig, state.contextConfig, settingsLoaded]);

  useEffect(() => { setLowRateMode(state.lowRateMode); }, [state.lowRateMode]);

  // Seed the single built-in DeepSeek starter model without forcing a model name.
  useEffect(() => {
    void (async () => {
      const existing = await Stores.getAllModels();
      if (existing.length === 0) {
        await Stores.addModel({
          id: 'default-deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          defaultModel: '',
          latency: -1,
          maxContextTokens: 64000,
          temperature: 0.8,
          topP: 0.95,
        });
          safeSetLocalStorage('jg2_ds_seeded', '1');
          window.dispatchEvent(new Event('jg2:models-changed'));
      }

      // One-time cleanup for the old built-in starter that forced deepseek-v4-pro.
      if (safeGetLocalStorage('jg2_ds_model_name_reset') !== '1') {
        const legacyStarter = existing.find((model) => model.id === 'default-deepseek' && model.defaultModel === 'deepseek-v4-pro');
        if (legacyStarter) {
          await Stores.updateModel(legacyStarter.id, { defaultModel: '' });
          safeSetLocalStorage('jg2_ds_model_name_reset', '1');
          window.dispatchEvent(new Event('jg2:models-changed'));
        } else {
          safeSetLocalStorage('jg2_ds_model_name_reset', '1');
        }
      }
    })();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
