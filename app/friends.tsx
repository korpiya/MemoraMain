import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/constants/SupabaseConfig';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

type FriendProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

export default function FriendsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadFriends() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (active) {
          setMessage('Sign in to find and add friends.');
          setLoading(false);
        }
        return;
      }

      if (active) setUserId(user.id);
      const { data, error } = await supabase.rpc('get_my_friends');
      if (active) {
        if (error) setMessage(error.message);
        else setFriends((data || []) as FriendProfile[]);
        setLoading(false);
      }
    }

    loadFriends().catch(error => {
      if (active) {
        setMessage(error.message || 'Unable to load friends.');
        setLoading(false);
      }
    });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!userId || !query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_profiles', { search_term: query.trim() });
      if (!active) return;
      if (error) {
        setMessage(error.message);
        setResults([]);
      } else {
        setMessage('');
        setResults(((data || []) as FriendProfile[]).filter(profile => profile.id !== userId));
      }
      setSearching(false);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, userId]);

  async function addFriend(profile: FriendProfile) {
    setAddingId(profile.id);
    setMessage('');
    const { error } = await supabase.rpc('add_friend', { target_user_id: profile.id });
    if (error) {
      setMessage(error.message);
    } else {
      setFriends(current => current.some(friend => friend.id === profile.id) ? current : [...current, profile]);
      setResults(current => current.filter(result => result.id !== profile.id));
    }
    setAddingId(null);
  }

  function renderProfile(profile: FriendProfile, isFriend: boolean) {
    return (
      <View style={[styles.personRow, { borderBottomColor: colors.borderColor }]}>
        <View style={styles.personText}>
          <Text style={[styles.username, { color: colors.text }]}>@{profile.username}</Text>
          {!!profile.full_name && <Text style={[styles.fullName, { color: colors.text }]}>{profile.full_name}</Text>}
        </View>
        {isFriend ? (
          <Text style={[styles.addedLabel, { color: colors.success }]}>Friends</Text>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Add @${profile.username} as a friend`}
            disabled={addingId === profile.id}
            onPress={() => addFriend(profile)}
            style={[styles.addButton, { backgroundColor: colors.tint, opacity: addingId === profile.id ? 0.7 : 1 }]}
          >
            <Text style={styles.addButtonText}>{addingId === profile.id ? 'Adding...' : 'Add friend'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Friends</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Search usernames"
        placeholderTextColor={colorScheme === 'dark' ? '#94a3b8' : '#64748b'}
        accessibilityLabel="Search usernames"
        style={[styles.searchInput, { color: colors.text, borderColor: colors.borderColor, backgroundColor: colors.cardBg }]}
      />

      {searching && <ActivityIndicator color={colors.tint} style={styles.loader} />}
      {!!message && <Text style={styles.message}>{message}</Text>}

      {query.trim() ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => renderProfile(item, friends.some(friend => friend.id === item.id))}
          ListEmptyComponent={!searching ? <Text style={[styles.emptyText, { color: colors.text }]}>No users found.</Text> : null}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your friends</Text>
          {loading ? <ActivityIndicator color={colors.tint} style={styles.loader} /> : (
            <FlatList
              data={friends}
              keyExtractor={item => item.id}
              renderItem={({ item }) => renderProfile(item, true)}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.text }]}>No friends yet. Search a username to add someone.</Text>}
              contentContainerStyle={styles.listContent}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  loader: {
    marginVertical: 18,
  },
  message: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 12,
  },
  listContent: {
    flexGrow: 1,
  },
  personRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  personText: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  fullName: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 3,
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  addedLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 15,
    opacity: 0.7,
    paddingVertical: 18,
  },
});
