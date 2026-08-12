/**
 * MsPullToRefresh — compact pull-to-refresh indicator.
 * Drop-in RefreshControl props helper with themed colors.
 */
import { RefreshControl } from 'react-native';
import { T } from '@/constants/theme';

interface MsPullToRefreshProps {
  refreshing: boolean;
  onRefresh: () => void;
}

export function usePullToRefreshProps({ refreshing, onRefresh }: MsPullToRefreshProps) {
  return {
    refreshControl: (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={T.ACCENT}
        colors={[T.ACCENT]}
        progressBackgroundColor={T.SURFACE}
      />
    ),
  };
}
