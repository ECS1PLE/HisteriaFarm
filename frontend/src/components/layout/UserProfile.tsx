export default function UserProfile({
  name,
  description,
  initial,
}: {
  name: string
  description: string
  initial: string
}) {
  return (
    <div className="sidebar-profile">
      <span className="profile-avatar">{initial}</span>
      <div>
        {name}
        <small>{description}</small>
      </div>
      <span className="profile-dot" />
    </div>
  )
}
