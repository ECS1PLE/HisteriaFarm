import {
  CommentOutlined,
  HeartOutlined,
  ThunderboltFilled,
  UserOutlined,
} from '@ant-design/icons'
export default function OrbitIllustration() {
  return (
    <div className="orbit-illustration" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit-center">
        <ThunderboltFilled aria-hidden="true" />
      </div>
      <span className="orbit-node node-one">
        <CommentOutlined aria-hidden="true" />
      </span>
      <span className="orbit-node node-two">
        <HeartOutlined aria-hidden="true" />
      </span>
      <span className="orbit-node node-three">
        <UserOutlined aria-hidden="true" />
      </span>
      <span className="orbit-star">✦</span>
    </div>
  )
}
