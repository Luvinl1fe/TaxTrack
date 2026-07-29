/**
 * Full-screen receipt photo viewer with pinch-zoom and pan.
 *
 * A thumbnail is enough to confirm a photo attached; it is not enough to read
 * a line item, a date or an ABN. This is the screen an accountant actually
 * uses, so it has to magnify far past fit-to-screen — faded thermal receipts
 * are often only legible at several times their natural size.
 *
 * Gestures are the ones people already expect from their phone's photo app:
 * pinch to zoom, drag to pan, double-tap to toggle.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Upper bound on zoom. Generous on purpose: faint thermal print needs it. */
const MAX_SCALE = 8;
/** Where a double-tap jumps to — enough to read body text on a receipt. */
const DOUBLE_TAP_SCALE = 3;

export function PhotoViewer({
  uri,
  visible,
  onClose,
}: {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      // Clamped on release rather than during the gesture, so the image still
      // tracks the fingers and springs back — fighting the pinch mid-way feels
      // like the app is broken.
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }

      if (scale.value > MAX_SCALE) {
        scale.value = withTiming(MAX_SCALE);
        savedScale.value = MAX_SCALE;
        return;
      }

      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      // Panning a fit-to-screen image would slide it off into blank space.
      if (savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (uri === null) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      // Full-screen rather than a sheet: every pixel of a receipt matters, and
      // a sheet's inset margins are wasted space here.
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onShow={reset}>
      <View style={styles.backdrop}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={styles.canvas}>
            <Animated.View style={[styles.canvas, imageStyle]}>
              <Image source={{ uri }} style={styles.image} contentFit="contain" />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        <Pressable
          onPress={onClose}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <Text style={[styles.hint, { bottom: insets.bottom + 20 }]}>
          Pinch to zoom · double-tap to magnify
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Fixed black regardless of theme: a light surround changes how the eye
  // reads a faded receipt, and every photo app does the same.
  backdrop: { flex: 1, backgroundColor: '#000' },
  // Plain `flex: 1` with no centering. Centering here sets the child's
  // cross-axis size to auto, which collapses a percentage-sized image to zero
  // — the image is there, measuring 0×0, on a black background.
  // `contentFit="contain"` does the centring instead.
  canvas: { flex: 1 },
  image: { flex: 1 },
  close: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#fff',
    opacity: 0.5,
    fontSize: 12,
  },
});
