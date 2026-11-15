import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { fetch as expoFetch } from 'expo/fetch';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { subscribeToAudioPlayback, toggleAudioPlayback } from '../../constants/audioPlayback';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../constants/SupabaseConfig';

const isVideoUrl = (url?: string | null) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.m4v') || lower.endsWith('.webm') || lower.includes('video');
};

const readGeminiStream = async (response: Response, onAnswer: (answer: string) => void) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming is not supported by this device.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  const processEvent = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (!data || data === '[DONE]') return;

    const chunk: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } = JSON.parse(data);
    const text = chunk.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');

    if (text) {
      answer += text;
      onAnswer(answer);
    }
  };

  const consumeEvents = () => {
    const eventBoundary = /\r?\n\r?\n/;
    let boundary: RegExpExecArray | null;
    while ((boundary = eventBoundary.exec(buffer)) !== null) {
      processEvent(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary[0].length);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    consumeEvents();
    if (done) break;
  }
  if (buffer.trim()) processEvent(buffer);

  return answer.trim();
};

interface Story {
  id: string;
  title: string;
  description: string;
  media_url: string | null;
  song_url?: string | null;
  created_at: string;
  status: string;
  author_id: string;
  is_public: boolean;
}

export default function TabOneScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const isFocused = useIsFocused();

  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    return subscribeToAudioPlayback(setPlayingSongId);
  }, []);

  const getSongTitle = (story: Story) => {
    if (story.song_url) {
      try {
        const url = new URL(story.song_url);
        const path = url.pathname;
        const filename = path.split('/').pop();
        return filename ? filename.split('.')[0] : 'Song';
      } catch {
        return 'Song';
      }
    }
    return null;
  };

  const playSong = async (songUrl: string, storyId: string) => {
    try {
      await toggleAudioPlayback(songUrl, storyId);
    } catch (error) {
      console.error('Audio playback error:', error);
      Alert.alert('Error', 'Unable to play the song. Please check your audio settings.');
    }
  };

  // Wrap fetch in useCallback to prevent re-renders
  const fetchMemories = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        return; // User handled by navigation/auth flow
      }

      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('author_id', user.id)
        .neq('status', 'deleted') // Simpler than .not('status', 'eq', 'deleted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories(data || []);
    } catch (error: any) {
      console.error('Fetch Error:', error.message);
      Alert.alert('Error', 'Failed to load your memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      fetchMemories();
    }
  }, [isFocused, fetchMemories]);


  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMemories();
    setRefreshing(false);
  };

  const publishMemory = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'approved', is_public: true })
        .eq('id', storyId);

      if (error) throw error;
      await fetchMemories();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Unable to publish memory.');
    }
  };

  const handleAskMemoryAI = async () => {
    const trimmedQuestion = aiQuestion.trim();
    if (!trimmedQuestion) {
      Alert.alert('Ask Gemini', 'Please enter a question first.');
      return;
    }

    setAiResponse('');
    setAiLoading(true);
    const requestController = new AbortController();
    const requestTimeout = setTimeout(() => requestController.abort(), 30_000);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Please sign in again to use Gemini.');

      const response = await expoFetch(`${supabaseUrl}/functions/v1/gemini-chat`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        signal: requestController.signal,
        body: JSON.stringify({
          question: trimmedQuestion,
          memoryCount: stories.length,
          memories: stories.slice(0, 5).map(({ title, description, created_at }) => ({
            title,
            description: description.slice(0, 500),
            created_at,
          })),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let message = `The chat function failed with status ${response.status}.`;
        if (errorBody) {
          try {
            const result: { error?: unknown } = JSON.parse(errorBody);
            if (typeof result.error === 'string') message = result.error;
          } catch {
            message = errorBody;
          }
        }
        throw new Error(message);
      }

      const answer = await readGeminiStream(response, setAiResponse);
      if (!answer) throw new Error('Gemini returned an empty response. Please try again.');
    } catch (error) {
      console.error('Gemini request failed:', error);
      const message = error instanceof Error && error.name === 'AbortError'
        ? 'Gemini took too long to respond. Please check your connection and try again.'
        : error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';
      Alert.alert('Gemini unavailable', message);
    } finally {
      clearTimeout(requestTimeout);
      setAiLoading(false);
    }
  };

  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories;
    const normalized = searchQuery.trim().toLowerCase();
    return stories.filter((item) =>
      item.title.toLowerCase().includes(normalized) ||
      item.description.toLowerCase().includes(normalized)
    );
  }, [stories, searchQuery]);

  return (
    <LinearGradient
      colors={colorScheme === 'dark' ? ['#0f172a', '#111827'] : colorScheme === 'system' ? ['#fef3c7', '#fef08a'] : ['#f0f9ff', '#f3f4f6']}
      style={styles.gradientContainer}
    >
      <View style={styles.container}>
        <View style={[styles.aiContainer, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}> 
          <Text style={[styles.aiTitle, { color: colors.text }]}>Gemini AI</Text>
          <Text style={[styles.aiDescription, { color: colors.text, opacity: 0.8 }]}>Ask Gemini anything, including questions about your memories.</Text>
          <TextInput
            style={[styles.aiInput, { backgroundColor: colorScheme === 'dark' ? '#1f2937' : '#f8fafc', color: colors.text, borderColor: colors.borderColor }]}
            placeholder="Ask Gemini anything..."
            placeholderTextColor={colors.text + '80'}
            value={aiQuestion}
            onChangeText={(text) => {
              setAiQuestion(text);
              if (aiResponse) setAiResponse('');
            }}
            returnKeyType="send"
            onSubmitEditing={handleAskMemoryAI}
          />
          <TouchableOpacity
            style={[styles.aiButton, { backgroundColor: '#fff59d', borderColor: '#facc15', borderWidth: 1, opacity: aiLoading ? 0.6 : 1 }]}
            onPress={handleAskMemoryAI}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <ActivityIndicator color="#1f2937" />
            ) : (
              <Text style={[styles.aiButtonText, { color: '#1f2937' }]}>Ask Gemini</Text>
            )}
          </TouchableOpacity>
          {aiResponse ? (
            <View style={[styles.aiResponseContainer, { backgroundColor: colorScheme === 'dark' ? '#111827' : '#f8fafc', borderColor: colors.borderColor }]}> 
              <Text style={[styles.aiResponseTitle, { color: colors.text }]}>Answer</Text>
              <Text style={[styles.aiResponseText, { color: colors.text }]}>{aiResponse}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerContainer}>
           <Text style={[styles.headerTitle, { color: colors.text }]}>Memories</Text>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.cardBg, color: colors.text, borderColor: colors.borderColor }]}
            placeholder="Search memories..."
            placeholderTextColor={colors.text + '80'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={filteredStories}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
            ListEmptyComponent={
                <View style={styles.emptyContainer}>
                    <FontAwesome name="inbox" size={40} color={colors.tint} />
                    <Text style={[styles.emptyText, { color: colors.text, opacity: 0.7 }]}>No memories found</Text>
                </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
                {item.media_url && (
                  <TouchableOpacity onPress={() => router.push(`/memory/${item.id}`)}>
                    {isVideoUrl(item.media_url) ? (
                      <Video
                        source={{ uri: item.media_url }}
                        style={styles.cardImage}
                        useNativeControls
                        resizeMode={ResizeMode.COVER}
                        isLooping={false}
                      />
                    ) : (
                      <Image source={{ uri: item.media_url }} style={styles.cardImage} />
                    )}
                  </TouchableOpacity>
                )}
                <View style={styles.cardContent}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.cardText, { color: colors.text, opacity: 0.7 }]} numberOfLines={2}>{item.description}</Text>
                  <Text style={[styles.cardDate, { color: colors.text, opacity: 0.5 }]}>{new Date(item.created_at).toLocaleString()}</Text>
                  {getSongTitle(item) && (
                    <View style={styles.songContainer}>
                      <Text style={[styles.songTitle, { color: colors.text, opacity: 0.6 }]}>Song: {getSongTitle(item)}</Text>
                      <TouchableOpacity onPress={() => playSong(item.song_url!, item.id)} style={styles.playButton}>
                        <FontAwesome name={playingSongId === item.id ? 'pause' : 'play'} size={14} color={colors.tint} />
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  <View style={styles.actionButtons}>
                    <TouchableOpacity onPress={() => router.push(`/memory/${item.id}`)} style={styles.actionBtn}>
                        <FontAwesome name="edit" size={14} color={colors.tint} />
                        <Text style={[styles.actionText, { color: colors.tint }]}>Edit</Text>
                    </TouchableOpacity>
                    {item.status === 'pending' && (
                      <TouchableOpacity onPress={() => publishMemory(item.id)} style={styles.actionBtn}>
                        <FontAwesome name="globe" size={14} color={colors.success} />
                        <Text style={[styles.actionText, { color: colors.success }]}>Publish</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: { flex: 1 },
  container: { flex: 1, paddingTop: 24 },
  headerContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 34, fontWeight: '900', marginBottom: 8 },
  headerSubtitle: { fontSize: 15, lineHeight: 22 },
  aiContainer: { marginHorizontal: 20, marginTop: 12, marginBottom: 18, borderRadius: 24, padding: 20, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 5 }, shadowRadius: 14, elevation: 4 },
  aiTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  aiDescription: { fontSize: 14, marginBottom: 16, lineHeight: 22 },
  aiInput: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 14 },
  aiButton: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  aiButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  aiResponseContainer: { marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1 },
  aiResponseTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  aiResponseText: { fontSize: 14, lineHeight: 22 },
  searchContainer: { paddingHorizontal: 20, marginBottom: 18 },
  searchInput: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 14, fontSize: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
  emptyContainer: { alignItems: 'center', marginTop: 120, gap: 10 },
  emptyText: { fontSize: 16 },
  listContent: { paddingHorizontal: 15, paddingBottom: 140 },
  card: { borderRadius: 20, marginBottom: 18, overflow: 'hidden', borderWidth: 0, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18 },
  cardImage: { width: '100%', height: 190 },
  cardContent: { padding: 20 },
  cardTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  cardText: { fontSize: 15, marginBottom: 12, lineHeight: 22 },
  cardDate: { fontSize: 12, marginBottom: 12 },
  actionButtons: { flexDirection: 'row', gap: 18, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontWeight: '600', fontSize: 14 },
  songContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  songTitle: { fontSize: 12, flex: 1 },
  playButton: { padding: 4 },
});