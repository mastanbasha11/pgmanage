import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ROIRoom {
  room_id: string;
  room_number: string;
  room_type: string | null;
  capacity: number | null;
  monthly_base_rent_paise: number | null;
  revenue_paise: number;
  rent_txns: number;
  occupied_beds: number;
  vacant_beds: number;
  reserved_beds: number;
  total_beds: number;
  revenue_per_bed_paise: number;
  revenue_per_bed_per_month_paise: number;
  expected_monthly_paise: number;
}

export interface ROIRoomType {
  room_type: string;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  capacity: number | null;
  revenue_paise: number;
  revenue_per_bed_per_month_paise: number;
  occupancy_rate: number;
}

export function useROI(params: { property_id?: string; months?: number }) {
  return useQuery<{
    months: number;
    rooms: ROIRoom[];
    room_types: ROIRoomType[];
  }>({
    queryKey: ['roi-by-room', params.property_id, params.months],
    queryFn: () =>
      api
        .get('/dashboard/roi-by-room', {
          params: { property_id: params.property_id, months: params.months ?? 6 },
        })
        .then((r) => r.data),
    enabled: !!params.property_id,
  });
}
