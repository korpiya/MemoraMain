import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ResizeMode, Video } from 'expo-av';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { supabase } from '../constants/SupabaseConfig';

interface Memory {
  id: string;
  title: string;
  description: string;
  media_url: string | null;
  created_at: string;
}

interface Friend {
  id: string;
  name: string;
  status: string;
  initials: string;
  color: string;
}

const FRIENDS: Friend[] = [
  { id: '1', name: 'Ava', status: 'Online', initials: 'A', color: '#8b5cf6' },
  { id: '2', name: 'Leo', status: 'In a memory', initials: 'L', color: '#f59e0b' },
  { id: '3', name: 'Mia', status: 'Sharing today', initials: 'M', color: '#10b981' },
  { id: '4', name: 'Noah', status: 'Away', initials: 'N', color: '#ef4444' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const isVideoUrl = (url?: string | null) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.m4v') || lower.endsWith('.webm') || lower.includes('video');
};

function FriendsPanel({ colors }: { colors: { text: string; background: string; tint: string; cardBg: string; borderColor: string } }) {
  return (
    <View style={[styles.friendsPanel, { borderColor: colors.borderColor, backgroundColor: colors.cardBg }]}>
      <View style={styles.friendsHeaderRow}>
        <View style={[styles.friendsIcon, { backgroundColor: `${colors.tint}20` }]}>
          <FontAwesome name="users" size={16} color={colors.tint} />
        </View>
        <Text style={[styles.friendsTitle, { color: colors.text }]}>Friends</Text>
      </View>

      {FRIENDS.map((friend) => (
        <View key={friend.id} style={styles.friendRow}>
          <View style={[styles.avatar, { backgroundColor: friend.color }]}>
            <Text style={styles.avatarText}>{friend.initials}</Text>
          </View>
          <View style={styles.friendCopy}>
            <Text style={[styles.friendName, { color: colors.text }]}>{friend.name}</Text>
            <Text style={[styles.friendStatus, { color: colors.text }]}>{friend.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const colors = Colors[colorScheme ?? 'light'];
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  useEffect(() => {
    const fetchMemories = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('author_id', user.id)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setMemories(data || []);
      } catch (error) {
        console.error('Calendar memories error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMemories();
  }, []);

  const memoriesByDate = useMemo(() => {
    const grouped = new Map<string, Memory[]>();
    memories.forEach((memory) => {
      const key = dateKey(new Date(memory.created_at));
      grouped.set(key, [...(grouped.get(key) || []), memory]);
    });
    return grouped;
  }, [memories]);

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  }, [month]);

  const selectedMemories = memoriesByDate.get(dateKey(selectedDate)) || [];
  const changeMonth = (amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <FriendsPanel colors={colors} />

        <View style={[styles.calendar, { borderColor: colors.borderColor, backgroundColor: colors.cardBg }]}>
          <View style={styles.monthHeader}>
            <Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.monthButton}>
              <FontAwesome name="chevron-left" size={14} color={colors.tint} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.text }]}>
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.monthButton}>
              <FontAwesome name="chevron-right" size={14} color={colors.tint} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {WEEKDAYS.map((weekday) => (
              <Text key={weekday} style={[styles.weekday, { color: colors.text }]}>{weekday}</Text>
            ))}
            {days.map((day, index) => {
              if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const isSelected = dateKey(date) === dateKey(selectedDate);
              const hasMemories = memoriesByDate.has(dateKey(date));
              return (
                <Pressable
                  key={day}
                  accessibilityLabel={`${date.toLocaleDateString()}${hasMemories ? ', memories saved' : ''}`}
                  onPress={() => setSelectedDate(date)}
                  style={[styles.dayCell, isSelected && { backgroundColor: colors.tint }]}
                >
                  <Text style={[styles.dayText, { color: isSelected ? '#ffffff' : colors.text }]}>{day}</Text>
                  {hasMemories && <View style={[styles.memoryDot, { backgroundColor: isSelected ? '#ffffff' : colors.tint }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.tint} style={styles.loader} />
      ) : selectedMemories.length ? (
        <FlatList
          data={selectedMemories}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`Open memory: ${item.title}`}
              onPress={() => router.push(`/memory/${item.id}`)}
              style={[styles.memoryCard, { borderColor: colors.borderColor, backgroundColor: colors.cardBg }]}
            >
              {item.media_url ? (
                isVideoUrl(item.media_url) ? (
                  <Video
                    source={{ uri: item.media_url }}
                    style={styles.memoryImage}
                    useNativeControls
                    resizeMode={ResizeMode.COVER}
                    isLooping={false}
                  />
                ) : (
                  <Image source={{ uri: item.media_url }} style={styles.memoryImage} resizeMode="cover" />
                )
              ) : (
                <View style={[styles.memoryPlaceholder, { backgroundColor: colors.background }]}>
                  <FontAwesome name="book" size={24} color={colors.tint} />
                </View>
              )}
              <View style={styles.memoryCopy}>
                <Text style={[styles.memoryTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.memoryDescription, { color: colors.text }]} numberOfLines={2}>{item.description}</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <Text style={[styles.emptyText, { color: colors.text }]}>No memories on this date.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  friendsPanel: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 12, minWidth: 140, maxWidth: 220 },
  friendsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  friendsIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  friendsTitle: { fontSize: 18, fontWeight: '700' },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  friendCopy: { flex: 1 },
  friendName: { fontSize: 14, fontWeight: '600' },
  friendStatus: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  calendar: { flex: 2, borderWidth: 1, borderRadius: 8, padding: 12 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 18, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 8, opacity: 0.65 },
  dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayText: { fontSize: 14 },
  memoryDot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 5 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  loader: { marginTop: 28 },
  memoryCard: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
  memoryImage: { width: '100%', height: 190, backgroundColor: '#e5e7eb' },
  memoryPlaceholder: { width: '100%', height: 190, alignItems: 'center', justifyContent: 'center' },
  memoryCopy: { padding: 12, gap: 4 },
  memoryTitle: { fontSize: 16, fontWeight: '600' },
  memoryDescription: { fontSize: 14, opacity: 0.7 },
  emptyText: { marginTop: 8, fontSize: 14, opacity: 0.65 },
});