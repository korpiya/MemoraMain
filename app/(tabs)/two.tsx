import { Text, View } from '@/components/Themed';
import { useColorScheme, useTheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { supabase } from '../../constants/SupabaseConfig';

const SAVED_ACCOUNTS_KEY = '@memora/saved-account-emails';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ totalMemories: 0, drafts: 0, published: 0 });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (isFocused) {
      fetchUserData();
    }
  }, [isFocused]);

  async function fetchUserData() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .maybeSingle();

        const username = profile?.username || user.user_metadata?.username;
        if (username) {
          setUser((currentUser: any) => ({
            ...currentUser,
            user_metadata: { ...currentUser?.user_metadata, username },
          }));

          if (!profile?.username) {
            const { error: profileError } = await supabase
              .from('profiles')
              .upsert(
                {
                  id: user.id,
                  username,
                  full_name: user.user_metadata?.full_name || user.user_metadata?.name || username,
                },
                { onConflict: 'id' },
              );

            if (profileError) console.warn('Unable to sync profile username:', profileError.message);
          }
        }

        const { data: userStories } = await supabase
          .from('stories')
          .select('status')
          .eq('author_id', user.id);

        if (userStories) {
          setStats({
            totalMemories: userStories.length,
            drafts: userStories.filter(s => s.status === 'pending').length,
            published: userStories.filter(s => s.status === 'approved').length,
          });
        }
      } else {
        setStats({ totalMemories: 0, drafts: 0, published: 0 });
      }
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            router.replace('/signin');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleSwitchAccount = async () => {
    Alert.alert('Switch Account', 'Do you want to sign out and switch accounts?', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
              const storedAccounts = await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY);
              const savedAccounts: Array<{ email: string; avatarUrl: string | null; session?: object }> = storedAccounts
                ? JSON.parse(storedAccounts)
                : [];
              const normalizedEmail = user.email.trim().toLowerCase();
              const currentAccount = {
                email: normalizedEmail,
                avatarUrl: user.user_metadata?.avatar_url || null,
                session: (await supabase.auth.getSession()).data.session,
              };
              const nextAccounts = [
                currentAccount,
                ...savedAccounts.filter(account => (typeof account === 'string' ? account : account.email) !== normalizedEmail),
              ].slice(0, 5);
              await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(nextAccounts));
            }
            router.replace('/switch-account');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  };

  const handleNotificationsToggle = (value: boolean) => {
    setNotificationsEnabled(value);
    Alert.alert('Notifications', value ? 'Notifications enabled' : 'Notifications disabled');
  };

  const handleDarkModeToggle = async (value: boolean) => {
    await setTheme(value ? 'dark' : 'light');
    Alert.alert('Theme', value ? 'Dark mode enabled' : 'Light mode enabled');
  };

  const handleHelpSupport = () => {
    Alert.alert(
      'Help & Support',
      'Choose an option:',
      [
        { text: 'Email Support', onPress: () => Linking.openURL('mailto:support@memora.com?subject=Help with Memora') },
        { text: 'FAQ', onPress: () => Linking.openURL('https://memora.com/faq') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const colors = Colors[colorScheme ?? 'light'];

  return (
    <LinearGradient
      colors={colorScheme === 'dark'
        ? ['#0f172a', '#111827', '#0f172a']
        : colorScheme === 'system'
        ? ['#fef3c7', '#fef08a', '#fef3c7']
        : ['#f0f9ff', '#e0f2fe', '#f3f4f6']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientContainer}
    >
      <ScrollView style={styles.container}>
        <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.borderColor }]}>
          <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
            {user?.user_metadata?.avatar_url ? (
              <Image source={{ uri: user.user_metadata.avatar_url }} style={styles.avatarImage} />
            ) : (
              <FontAwesome name="user" size={40} color="#fff" />
            )}
          </View>
          <Text style={[styles.userName, { color: colors.text }]}>
            {user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'User'}
          </Text>
          {!!user?.user_metadata?.username && (
            <Text style={[styles.userEmail, { color: colors.text, opacity: 0.7, alignSelf: 'center' }]}>
              @{user.user_metadata.username}
            </Text>
          )}
          <Text style={[styles.userEmail, { color: colors.text, opacity: 0.7, alignSelf: 'center' }]}>
            Eranians Archive Member
          </Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[styles.statNumber, { color: colors.tint }]}>{stats.totalMemories}</Text>
            <Text style={[styles.statLabel, { color: colors.text }]}>Total Memories</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>{stats.drafts}</Text>
            <Text style={[styles.statLabel, { color: colors.text }]}>Drafts</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[styles.statNumber, { color: colors.success }]}>{stats.published}</Text>
            <Text style={[styles.statLabel, { color: colors.text }]}>Published</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          <View style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <FontAwesome name="bell" size={20} color={colors.tint} />
            <Text style={[styles.menuText, { color: colors.text }]}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: colors.borderColor, true: colors.tint }}
              thumbColor={notificationsEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>

          <TouchableOpacity
            onPress={() => router.push('/edit-profile')}
            style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
          >
            <FontAwesome name="edit" size={20} color={colors.tint} />
            <Text style={[styles.menuText, { color: colors.text }]}>Edit Profile</Text>
            <FontAwesome name="chevron-right" size={16} color={colors.borderColor} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
          >
            <FontAwesome name="cog" size={20} color={colors.tint} />
            <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
            <FontAwesome name="chevron-right" size={16} color={colors.borderColor} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleHelpSupport}
            style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
          >
            <FontAwesome name="question-circle" size={20} color={colors.tint} />
            <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
            <FontAwesome name="chevron-right" size={16} color={colors.borderColor} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSwitchAccount}
            style={[styles.menuItem, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}
          >
            <FontAwesome name="exchange" size={20} color="#4338ca" />
            <Text style={[styles.menuText, { color: '#1f2937' }]}>Switch Account</Text>
            <FontAwesome name="chevron-right" size={16} color="#4338ca" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.menuItem, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
          >
            <FontAwesome name="sign-out" size={20} color="#dc2626" />
            <Text style={[styles.menuText, { color: '#b91c1c' }]}>Logout</Text>
            <FontAwesome name="chevron-right" size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: { flex: 1 },
  container: { flex: 1 },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  menuSection: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
});
