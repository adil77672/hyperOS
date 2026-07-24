import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StoreProvider } from './src/lib/store';
import type { Order } from './src/lib/types';
import { MenuScreen } from './src/screens/MenuScreen';
import { CartScreen } from './src/screens/CartScreen';
import { CheckoutScreen } from './src/screens/CheckoutScreen';
import { OrderScreen } from './src/screens/OrderScreen';

export type RootStackParamList = {
  Menu: undefined;
  Cart: undefined;
  Checkout: undefined;
  Order: { orderId: string; order?: Order };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: '#0F5132' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '700' },
            }}
          >
            <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Menu' }} />
            <Stack.Screen name="Cart" component={CartScreen} options={{ title: 'Your cart' }} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
            <Stack.Screen name="Order" component={OrderScreen} options={{ title: 'Order status' }} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="light" />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
