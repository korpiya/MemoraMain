import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import React from 'react';
import { Image, Pressable, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
      }}>
      
      {/* Tab One: Home/Feed */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Memora',
          headerLeft: () => (
            <View style={{ marginLeft: 15, flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={require('../../assets/images/MemoraLogoNB.png')}
                style={{ width: 28, height: 28, marginRight: 8 }}
              />
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Link href="/calendar" asChild>
                <Pressable accessibilityLabel="Open Memora Calendar" style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                  <FontAwesome name="calendar" size={20} color={Colors[colorScheme ?? 'light'].tint} />
                </Pressable>
              </Link>

              <Link href={'/friends' as any} asChild>
                <Pressable accessibilityLabel="Open Memora Friends" style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                  <FontAwesome name="users" size={20} color={Colors[colorScheme ?? 'light'].tint} />
                </Pressable>
              </Link>
            </View>
          ),
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />

      {/* Tab Two: Existing Tab */}
      <Tabs.Screen
        name="two"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />

      {/* Published memories */}
      <Tabs.Screen
        name="published"
        options={{
          title: 'Published',
          tabBarIcon: ({ color }) => <TabBarIcon name="globe" color={color} />,
        }}
      />

      {/* NEW Tab: Add Memory Archive */}
      <Tabs.Screen
        name="add-memory"
        options={{
          title: 'Archive',
          tabBarIcon: ({ color }) => <FontAwesome name="plus-square" size={28} color={color} />,
        }}
      />

      <Tabs.Screen
        name="delete"
        options={{
          title: 'Recycle Bin',
          tabBarIcon: ({ color }) => <FontAwesome name="trash" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}