# Installing TensorFlow on MacBook Pro with Apple Silicon M1/M2

1. Install a clean version of Xcode

> Check if you already have it:
```
$ xcode-select -p
```
> [Uninstall the previous copy](https://mac.install.guide/commandlinetools/6.html):
```
$ sudo rm -rf /Library/Developer/CommandLineTools
```
> Install the new copy:
```
xcode-select -–install
```

2. Install python and TensorFlow according to these guidelines: https://developer.apple.com/metal/tensorflow-plugin/.

```
python -m pip install tensorflow
python -m pip install tensorflow-metal
```

